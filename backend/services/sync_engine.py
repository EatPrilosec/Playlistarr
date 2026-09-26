import asyncio
import httpx
import datetime
import json
from sqlalchemy.orm import Session
from ..models import ListConfig, Server, SyncLog
from .providers.factory import get_provider
from .media_server import MediaServerClient
from .sync_tracker import sync_tracker

async def sync_list_config(db: Session, list_config: ListConfig):
    try:
        sync_tracker.start_sync(list_config.id, list_config.name)
        sync_tracker.update_sync(
            list_config.id,
            stage="fetching",
            details=f"Fetching playlist from {list_config.provider.upper()}...",
            progress=10
        )

        # Get provider and fetch list
        provider = get_provider(list_config.source_url, list_config.provider)
        items = await provider.fetch_list()
        total_items = len(items)

        sync_tracker.update_sync(
            list_config.id,
            stage="fetching",
            details=f"Retrieved {total_items} items from {list_config.provider.upper()}",
            progress=15,
            total_items=total_items
        )
        
        # Sort items based on sort_order
        if list_config.sort_order == "date_added":
            pass # Needs provider support
        elif list_config.sort_order == "rank":
            pass # Needs provider support
        else: # custom / default
            items.sort(key=lambda x: x.get("order", 0))

        # Push to ALL configured servers
        servers = db.query(Server).all()
        active_servers = [s for s in servers if s.api_key]
        num_servers = len(active_servers)
        results = []
        server_matches = {}

        for s_idx, server in enumerate(active_servers):
            ms_client = MediaServerClient(server.url, server.api_key, server.server_type)
            
            # Progress weighting: 70% total across all servers
            server_start_pct = 15 + (s_idx / max(1, num_servers)) * 70
            server_match_range = (0.75 / max(1, num_servers)) * 70
            server_push_range = (0.25 / max(1, num_servers)) * 70

            try:
                # Concurrent matching with Semaphore and shared httpx.AsyncClient
                matched_ids = []
                sem = asyncio.Semaphore(10)
                completed_matches = 0
                
                async with httpx.AsyncClient(timeout=30.0) as http_client:
                    async def match_item(it):
                        nonlocal completed_matches
                        async with sem:
                            try:
                                return await ms_client.search_item(
                                    title=it.get("title"),
                                    year=it.get("year"),
                                    item_type=it.get("type"),
                                    imdb_id=it.get("imdb_id"),
                                    tmdb_id=it.get("tmdb_id"),
                                    tvdb_id=it.get("tvdb_id"),
                                    show_title=it.get("show_title"),
                                    season_number=it.get("season_number") if it.get("season_number") is not None else it.get("season"),
                                    episode_number=it.get("episode_number") if it.get("episode_number") is not None else it.get("episode"),
                                    client=http_client
                                )
                            except Exception as item_err:
                                print(f"Error matching item '{it.get('title')}': {item_err}")
                                return None
                            finally:
                                completed_matches += 1
                                if completed_matches % 10 == 0 or completed_matches == total_items:
                                    pct = server_start_pct + (completed_matches / max(1, total_items)) * server_match_range
                                    sync_tracker.update_sync(
                                        list_config.id,
                                        stage="matching",
                                        details=f"Matching on {server.name}: {completed_matches}/{total_items} items checked",
                                        progress=round(pct),
                                        current_item=completed_matches,
                                        total_items=total_items,
                                        server=server.name
                                    )
                    
                    search_results = await asyncio.gather(*(match_item(it) for it in items))
                    server_matches[server.name] = search_results
                    matched_ids = [mid for mid in search_results if mid]

                if matched_ids:
                    push_start_pct = server_start_pct + server_match_range
                    sync_tracker.update_sync(
                        list_config.id,
                        stage="pushing",
                        details=f"Pushing {len(matched_ids)} items to {server.name}...",
                        progress=round(push_start_pct),
                        server=server.name
                    )

                    async def on_batch(batch_num, total_batches, uploaded_count, total_count):
                        batch_pct = push_start_pct + (batch_num / max(1, total_batches)) * server_push_range
                        sync_tracker.update_sync(
                            list_config.id,
                            stage="pushing",
                            details=f"Pushing to {server.name}: batch {batch_num}/{total_batches} ({uploaded_count}/{total_count} items)",
                            progress=round(batch_pct),
                            current_item=uploaded_count,
                            total_items=total_count,
                            server=server.name
                        )

                    images = {
                        "Primary": list_config.image_url,
                        "Backdrop": list_config.backdrop_url,
                        "Banner": list_config.banner_url
                    }
                    if list_config.is_global:
                        # For global playlists: create ONCE on the server as public
                        if ms_client.server_type != "jellyfin":
                            await ms_client.detect_server_type()

                        if ms_client.server_type == "jellyfin":
                            users = await ms_client.get_users()
                            admin_id = None
                            for u in users:
                                if u.get("Policy", {}).get("IsAdministrator"):
                                    admin_id = u.get("Id")
                                    break
                            admin_id = admin_id or (users[0].get("Id") if users else None)
                            await ms_client.create_or_update_playlist(list_config.name, matched_ids, user_id=admin_id, images=images, is_public=True, progress_callback=on_batch)
                        else:
                            # Emby: create once at server level without user_id for a true public playlist
                            await ms_client.create_or_update_playlist(list_config.name, matched_ids, user_id=None, images=images, is_public=True, progress_callback=on_batch)
                    else:
                        if list_config.target_username:
                            users = await ms_client.get_users()
                            target_id = None
                            for u in users:
                                if (u.get("Name") or "").lower() == list_config.target_username.lower():
                                    target_id = u.get("Id")
                                    break
                            if target_id:
                                # For servers with per-user libraries (e.g. Emby), ensure no other users retain this playlist
                                for u in users:
                                    if u.get("Id") != target_id:
                                        try:
                                            await ms_client.delete_playlist(list_config.name, user_id=u.get("Id"))
                                        except Exception:
                                            pass
                                await ms_client.create_or_update_playlist(list_config.name, matched_ids, user_id=target_id, images=images, is_public=False, progress_callback=on_batch)
                            else:
                                raise Exception(f"User {list_config.target_username} not found on {server.name}")
                        else:
                            await ms_client.create_or_update_playlist(list_config.name, matched_ids, images=images, is_public=False, progress_callback=on_batch)
                            
                results.append(f"{server.name}: {len(matched_ids)}/{len(items)} matched")
            except Exception as se:
                err_msg = str(se).strip() or type(se).__name__
                results.append(f"{server.name}: Error ({err_msg})")

        # Build item details with per-server match status
        sync_tracker.update_sync(
            list_config.id,
            stage="saving",
            details="Saving match results...",
            progress=92
        )

        item_details = []
        for idx, it in enumerate(items):
            srv_status = {}
            any_matched = False
            all_matched = True if servers else False
            for server in servers:
                if not server.api_key:
                    continue
                res_list = server_matches.get(server.name, [])
                mid = res_list[idx] if idx < len(res_list) else None
                srv_status[server.name] = {
                    "matched": bool(mid),
                    "item_id": mid,
                    "server_type": server.server_type
                }
                if mid:
                    any_matched = True
                else:
                    all_matched = False

            item_details.append({
                "order": it.get("order", idx + 1),
                "title": it.get("title"),
                "year": it.get("year"),
                "type": it.get("type", "movie"),
                "show_title": it.get("show_title"),
                "season": it.get("season_number") if it.get("season_number") is not None else it.get("season"),
                "episode": it.get("episode_number") if it.get("episode_number") is not None else it.get("episode"),
                "season_number": it.get("season_number") if it.get("season_number") is not None else it.get("season"),
                "episode_number": it.get("episode_number") if it.get("episode_number") is not None else it.get("episode"),
                "imdb_id": it.get("imdb_id"),
                "tmdb_id": it.get("tmdb_id"),
                "tvdb_id": it.get("tvdb_id"),
                "matched": any_matched,
                "all_matched": all_matched,
                "servers": srv_status
            })

        list_config.last_items_json = json.dumps(item_details)

        # Update log
        details_str = " | ".join(results) if results else "No servers configured"
        log = SyncLog(
            list_config_id=list_config.id,
            status="success",
            details=details_str,
            last_sync=datetime.datetime.utcnow()
        )
        db.add(log)
        db.commit()

        sync_tracker.finish_sync(list_config.id, status="success", details=details_str)

    except Exception as e:
        err_msg = str(e).strip() or type(e).__name__
        log = SyncLog(
            list_config_id=list_config.id,
            status="error",
            details=err_msg,
            last_sync=datetime.datetime.utcnow()
        )
        db.add(log)
        db.commit()
        sync_tracker.finish_sync(list_config.id, status="error", details=err_msg)

async def get_playlist_items_with_matches(db: Session, list_config: ListConfig, force_refresh: bool = False) -> dict:
    servers = db.query(Server).filter(Server.api_key.isnot(None)).all()
    server_names = [s.name for s in servers]
    
    if not force_refresh and list_config.last_items_json:
        try:
            items = json.loads(list_config.last_items_json)
            matched_count = sum(1 for it in items if it.get("matched"))
            unmatched_count = len(items) - matched_count
            return {
                "playlist_id": list_config.id,
                "name": list_config.name,
                "provider": list_config.provider,
                "source_url": list_config.source_url,
                "total_items": len(items),
                "total_matched": matched_count,
                "matched_count": matched_count,
                "total_unmatched": unmatched_count,
                "unmatched_count": unmatched_count,
                "servers": server_names,
                "items": items
            }
        except Exception:
            pass

    # Fetch provider items and evaluate matches
    provider = get_provider(list_config.source_url, list_config.provider)
    items = await provider.fetch_list()
    if list_config.sort_order == "date_added":
        pass
    elif list_config.sort_order == "rank":
        pass
    else:
        items.sort(key=lambda x: x.get("order", 0))

    server_matches = {}
    for server in servers:
        ms_client = MediaServerClient(server.url, server.api_key, server.server_type)
        sem = asyncio.Semaphore(10)
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            async def match_item(it):
                async with sem:
                    try:
                        return await ms_client.search_item(
                            title=it.get("title"),
                            year=it.get("year"),
                            item_type=it.get("type"),
                            imdb_id=it.get("imdb_id"),
                            tmdb_id=it.get("tmdb_id"),
                            tvdb_id=it.get("tvdb_id"),
                            show_title=it.get("show_title"),
                            season_number=it.get("season_number") if it.get("season_number") is not None else it.get("season"),
                            episode_number=it.get("episode_number") if it.get("episode_number") is not None else it.get("episode"),
                            client=http_client
                        )
                    except Exception as item_err:
                        print(f"Error matching item '{it.get('title')}': {item_err}")
                        return None
            search_results = await asyncio.gather(*(match_item(it) for it in items))
            server_matches[server.name] = search_results

    item_details = []
    for idx, it in enumerate(items):
        srv_status = {}
        any_matched = False
        all_matched = True if servers else False
        for server in servers:
            res_list = server_matches.get(server.name, [])
            mid = res_list[idx] if idx < len(res_list) else None
            srv_status[server.name] = {
                "matched": bool(mid),
                "item_id": mid,
                "server_type": server.server_type
            }
            if mid:
                any_matched = True
            else:
                all_matched = False

        item_details.append({
            "order": it.get("order", idx + 1),
            "title": it.get("title"),
            "year": it.get("year"),
            "type": it.get("type", "movie"),
            "show_title": it.get("show_title"),
            "season": it.get("season_number") if it.get("season_number") is not None else it.get("season"),
            "episode": it.get("episode_number") if it.get("episode_number") is not None else it.get("episode"),
            "season_number": it.get("season_number") if it.get("season_number") is not None else it.get("season"),
            "episode_number": it.get("episode_number") if it.get("episode_number") is not None else it.get("episode"),
            "imdb_id": it.get("imdb_id"),
            "tmdb_id": it.get("tmdb_id"),
            "tvdb_id": it.get("tvdb_id"),
            "matched": any_matched,
            "all_matched": all_matched,
            "servers": srv_status
        })

    list_config.last_items_json = json.dumps(item_details)
    db.commit()

    matched_count = sum(1 for it in item_details if it.get("matched"))
    unmatched_count = len(item_details) - matched_count
    return {
        "playlist_id": list_config.id,
        "name": list_config.name,
        "provider": list_config.provider,
        "source_url": list_config.source_url,
        "total_items": len(item_details),
        "total_matched": matched_count,
        "matched_count": matched_count,
        "total_unmatched": unmatched_count,
        "unmatched_count": unmatched_count,
        "servers": server_names,
        "items": item_details
    }

async def run_sync_all(db: Session):
    configs = db.query(ListConfig).all()
    for conf in configs:
        await sync_list_config(db, conf)

async def run_sync_background(config_id: int):
    from ..database import SessionLocal
    db = SessionLocal()
    try:
        config = db.query(ListConfig).filter(ListConfig.id == config_id).first()
        if config:
            await sync_list_config(db, config)
    except Exception as e:
        sync_tracker.finish_sync(config_id, status="error", details=str(e))
    finally:
        db.close()
