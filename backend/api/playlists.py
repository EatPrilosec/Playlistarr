import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import JSONResponse, Response, FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
import datetime
from ..database import get_db
from ..models import ListConfig, User
from .auth import get_current_user
from ..services.sync_engine import run_sync_background

router = APIRouter(prefix="/api/playlists", tags=["playlists"])

CUSTOM_IMAGES_DIR = "/config/custom_images" if os.path.exists("/config") else os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "custom_images")
os.makedirs(CUSTOM_IMAGES_DIR, exist_ok=True)

class ListConfigRequest(BaseModel):
    name: str
    provider: str
    source_url: str
    sort_order: str = "custom"
    is_global: bool = False
    target_username: str | None = None
    image_url: str | None = None
    backdrop_url: str | None = None
    banner_url: str | None = None

@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload custom image file (poster, backdrop, or banner)"""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]:
        raise HTTPException(status_code=400, detail="Unsupported image format. Please upload JPG, PNG, WEBP, or SVG.")
        
    filename = f"{uuid.uuid4().hex[:12]}{ext}"
    dest_path = os.path.join(CUSTOM_IMAGES_DIR, filename)
    
    contents = await file.read()
    with open(dest_path, "wb") as f:
        f.write(contents)
        
    return {"url": f"/api/playlists/images/{filename}"}

@router.get("/images/{filename}")
async def get_image(filename: str):
    """Serve uploaded custom playlist images"""
    clean_name = os.path.basename(filename)
    path = os.path.join(CUSTOM_IMAGES_DIR, clean_name)
    if not os.path.exists(path) or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path)

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
        user_id=None if req.is_global else current_user.id,
        image_url=req.image_url,
        backdrop_url=req.backdrop_url,
        banner_url=req.banner_url
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
    config.image_url = req.image_url
    config.backdrop_url = req.backdrop_url
    config.banner_url = req.banner_url
    
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

@router.get("/{playlist_id}/export")
async def export_playlist(
    playlist_id: int,
    format: str = "json",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    config = db.query(ListConfig).filter(ListConfig.id == playlist_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    if not current_user.is_admin and config.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to export this playlist")
        
    # Fetch provider items
    items = []
    try:
        from ..services.providers.factory import get_provider
        provider = get_provider(config.source_url, config.provider)
        items = await provider.fetch_list()
    except Exception:
        items = []

    if format.lower() == "m3u":
        lines = ["#EXTM3U", f"#PLAYLIST:{config.name}"]
        for item in items:
            title = item.get("title", "Unknown")
            year = item.get("year", "")
            lines.append(f"#EXTINF:-1,{title} ({year})")
            lines.append(f"#TITLE:{title}")
        content = "\n".join(lines)
        return Response(
            content=content,
            media_type="audio/x-mpegurl",
            headers={"Content-Disposition": f'attachment; filename="{config.name}.m3u"'}
        )

    export_data = {
        "name": config.name,
        "provider": config.provider,
        "source_url": config.source_url,
        "is_global": config.is_global,
        "sort_order": config.sort_order,
        "target_username": config.target_username,
        "exported_at": datetime.datetime.utcnow().isoformat(),
        "item_count": len(items),
        "items": items
    }
    return JSONResponse(
        content=export_data,
        headers={"Content-Disposition": f'attachment; filename="{config.name}.json"'}
    )
