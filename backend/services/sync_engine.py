import asyncio
import httpx
import datetime
import json
from sqlalchemy.orm import Session
from ..models import ListConfig, Server, SyncLog
from .providers.factory import get_provider
from .media_server import MediaServerClient

async def sync_list_config(db: Session, list_config: ListConfig):
    try:
        # Get provider and fetch list
        provider = get_provider(list_config.source_url, list_config.provider)
        items = await provider.fetch_list()
        
        # Sort items based on sort_order
        if list_config.sort_order == "date_added":
            pass # Needs provider support
        elif list_config.sort_order == "rank":
            pass # Needs provider support
        else: # custom / default
            items.sort(key=lambda x: x.get("order", 0))

        # Push to ALL configured servers
        servers = db.query(Server).all()
        results = []
        server_matches = {}

        for server in servers:
            if not server.api_key:
                continue

            ms_client = MediaServerClient(server.url, server.api_key, server.server_type)
            
            try:
                # Concurrent matching with Semaphore and shared httpx.AsyncClient
                matched_ids = []
                sem = asyncio.Semaphore(10)
                
                async with httpx.AsyncClient(timeout=15.0) as http_client:
                    async def match_item(it):
                        async with sem:
                            return await ms_client.search_item(
                                title=it.get("title"),
                                year=it.get("year"),
                                item_type=it.get("type"),
                                imdb_id=it.get("imdb_id"),
                                tmdb_id=it.get("tmdb_id"),
                                tvdb_id=it.get("tvdb_id"),
                                show_title=it.get("show_title"),
                                client=http_client
                            )
                    
                    search_results = await asyncio.gather(*(match_item(it) for it in items))
                    server_matches[server.name] = search_results
                    matched_ids = [mid for mid in search_results if mid]

                if matched_ids:
                    images = {
                        "Primary": list_config.image_url,
                        "Backdrop": list_config.backdrop_url,
                        "Banner": list_config.banner_url
                    }
                    if list_config.is_global:
                        # Push to all users on this server
                        users = await ms_client.get_users()
                        for u in users:
                            await ms_client.create_or_update_playlist(list_config.name, matched_ids, user_id=u.get("Id"), images=images)
                    else:
                        if list_config.target_username:
                            users = await ms_client.get_users()
                            target_id = None
                            for u in users:
                                if u.get("Name", "").lower() == list_config.target_username.lower():
                                    target_id = u.get("Id")
                                    break
                            if target_id:
                                await ms_client.create_or_update_playlist(list_config.name, matched_ids, user_id=target_id, images=images)
                            else:
                                raise Exception(f"User {list_config.target_username} not found on {server.name}")
                        else:
                            await ms_client.create_or_update_playlist(list_config.name, matched_ids, images=images)
                            
                results.append(f"{server.name}: {len(matched_ids)}/{len(items)} matched")
            except Exception as se:
                results.append(f"{server.name}: Error ({str(se)})")

        # Build item details with per-server match status
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

    except Exception as e:
        log = SyncLog(
            list_config_id=list_config.id,
            status="error",
            details=str(e),
            last_sync=datetime.datetime.utcnow()
        )
        db.add(log)
        db.commit()

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
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            async def match_item(it):
                async with sem:
                    return await ms_client.search_item(
                        title=it.get("title"),
                        year=it.get("year"),
                        item_type=it.get("type"),
                        imdb_id=it.get("imdb_id"),
                        tmdb_id=it.get("tmdb_id"),
                        tvdb_id=it.get("tvdb_id"),
                        show_title=it.get("show_title"),
                        client=http_client
                    )
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
    finally:
        db.close()
