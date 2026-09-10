from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import ListConfig, User
from .auth import get_current_user
from ..services.sync_engine import run_sync_background

router = APIRouter(prefix="/api/playlists", tags=["playlists"])

class ListConfigRequest(BaseModel):
    name: str
    provider: str
    source_url: str
    sort_order: str = "custom"
    is_global: bool = False
    target_username: str | None = None

@router.post("")
async def create_playlist(
    req: ListConfigRequest,
    bg_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if req.is_global and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can create global playlists")
        
    config = ListConfig(
        name=req.name,
        provider=req.provider,
        source_url=req.source_url,
        sort_order=req.sort_order,
        is_global=req.is_global,
        target_username=req.target_username,
        user_id=None if req.is_global else current_user.id
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    
    # Trigger initial sync in background
    bg_tasks.add_task(run_sync_background, config.id)
    
    return {"message": "Playlist added successfully", "id": config.id}

@router.get("")
async def get_playlists(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Admins see all, users see global + personal
    if current_user.is_admin:
        configs = db.query(ListConfig).all()
    else:
        configs = db.query(ListConfig).filter(
            (ListConfig.user_id == current_user.id) | (ListConfig.is_global == True)
        ).all()
        
    return configs

@router.put("/{playlist_id}")
async def update_playlist(
    playlist_id: int,
    req: ListConfigRequest,
    bg_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    config = db.query(ListConfig).filter(ListConfig.id == playlist_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    if not current_user.is_admin and config.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this playlist")
        
    config.name = req.name
    config.provider = req.provider
    config.source_url = req.source_url
    config.sort_order = req.sort_order
    config.is_global = req.is_global
    
    if req.is_global:
        config.target_username = None
    else:
        config.target_username = req.target_username
        
    db.commit()
    db.refresh(config)
    
    bg_tasks.add_task(run_sync_background, config.id)
    return config

@router.get("/{playlist_id}/status")
async def get_playlist_status(playlist_id: int, db: Session = Depends(get_db)):
    from ..models import SyncLog
    log = db.query(SyncLog).filter(SyncLog.list_config_id == playlist_id).order_by(SyncLog.last_sync.desc()).first()
    if log:
        return {"status": log.status, "details": log.details, "last_sync": log.last_sync}
    return {"status": "pending", "details": "Waiting for first sync", "last_sync": None}

@router.post("/{playlist_id}/sync")
async def manual_sync_playlist(
    playlist_id: int, 
    bg_tasks: BackgroundTasks, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    config = db.query(ListConfig).filter(ListConfig.id == playlist_id).first()
    if not config:
        raise HTTPException(status_code=404)
        
    if not current_user.is_admin and config.user_id != current_user.id:
        raise HTTPException(status_code=403)
        
    bg_tasks.add_task(run_sync_background, config.id)
    return {"message": "Sync queued"}

@router.delete("/{playlist_id}")
async def delete_playlist(
    playlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    config = db.query(ListConfig).filter(ListConfig.id == playlist_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    if not current_user.is_admin and config.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this playlist")
        
    db.delete(config)
    db.commit()
    return {"message": "Playlist deleted successfully"}
