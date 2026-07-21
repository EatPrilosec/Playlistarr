from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import ListConfig, User
from .auth import get_current_user
from ..services.sync_engine import sync_list_config

router = APIRouter(prefix="/api/playlists", tags=["playlists"])

class ListConfigRequest(BaseModel):
    name: str
    provider: str
    source_url: str
    sort_order: str = "custom"
    is_global: bool = False

@router.post("/")
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
        user_id=None if req.is_global else current_user.id
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    
    # Trigger initial sync in background
    bg_tasks.add_task(sync_list_config, db, config)
    
    return {"message": "Playlist added successfully", "id": config.id}

@router.get("/")
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
