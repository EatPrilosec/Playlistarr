from sqlalchemy.orm import Session
from ..models import ListConfig, Server, SyncLog
from .providers.factory import get_provider
from .media_server import MediaServerClient
import datetime

async def sync_list_config(db: Session, list_config: ListConfig):
    try:
        # Get provider
        provider = get_provider(list_config.source_url, list_config.provider)
        items = await provider.fetch_list()
        
        # Sort items based on sort_order
        if list_config.sort_order == "date_added":
            pass # Needs provider support
        elif list_config.sort_order == "rank":
            pass # Needs provider support
        else: # custom
            items.sort(key=lambda x: x.get("order", 0))

        # Push to ALL configured servers
        servers = db.query(Server).all()
        
        results = []

        for server in servers:
            if not server.api_key:
                continue

            ms_client = MediaServerClient(server.url, server.api_key)
            
            try:
                # Match items
                matched_ids = []
                for item in items:
                    # Search by title and year
                    emby_id = await ms_client.search_item(item["title"], item.get("year"), item.get("type"))
                    if emby_id:
                        matched_ids.append(emby_id)

                if matched_ids:
                    if list_config.is_global:
                        # Push to all users on this server
                        users = await ms_client.get_users()
                        for u in users:
                            await ms_client.create_or_update_playlist(list_config.name, matched_ids, user_id=u.get("Id"))
                    else:
                        if list_config.target_username:
                            # Find the user by name
                            users = await ms_client.get_users()
                            target_id = None
                            for u in users:
                                if u.get("Name", "").lower() == list_config.target_username.lower():
                                    target_id = u.get("Id")
                                    break
                            if target_id:
                                await ms_client.create_or_update_playlist(list_config.name, matched_ids, user_id=target_id)
                            else:
                                raise Exception(f"User {list_config.target_username} not found on {server.name}")
                        else:
                            # Fallback to no user (admin)
                            await ms_client.create_or_update_playlist(list_config.name, matched_ids)
                            
                results.append(f"{server.name}: {len(matched_ids)}/{len(items)} matched")
            except Exception as se:
                results.append(f"{server.name}: Error ({str(se)})")
                
        # Update log
        details_str = " | ".join(results) if results else "No servers configured"
        log = SyncLog(list_config_id=list_config.id, status="success", details=details_str)
        db.add(log)
        db.commit()

    except Exception as e:
        log = SyncLog(list_config_id=list_config.id, status="error", details=str(e))
        db.add(log)
        db.commit()

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
