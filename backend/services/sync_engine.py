from sqlalchemy.orm import Session
from ..models import ListConfig, User, Server, SyncLog
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

        # Find users who should receive this playlist
        # If global, all users on the same server or all servers? All users.
        users = []
        if list_config.is_global:
            users = db.query(User).all()
        else:
            users = [db.query(User).filter(User.id == list_config.user_id).first()]

        for user in users:
            if not user or not user.server_id:
                continue
                
            server = db.query(Server).filter(Server.id == user.server_id).first()
            if not server or not user.api_key:
                continue

            ms_client = MediaServerClient(server.url, user.api_key)
            
            # Match items
            matched_ids = []
            for item in items:
                # Search by title and year
                emby_id = await ms_client.search_item(item["title"], item.get("year"), item.get("type"))
                if emby_id:
                    matched_ids.append(emby_id)

            if matched_ids:
                # Create/Update playlist
                await ms_client.create_or_update_playlist(list_config.name, matched_ids)
                
        # Update log
        log = SyncLog(list_config_id=list_config.id, status="success", details=f"Synced {len(items)} items")
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
