import os
import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import JSONResponse, Response, FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
import datetime
from ..database import get_db
from ..models import ListConfig, User
from .auth import get_current_user
from ..services.sync_engine import run_sync_background, get_playlist_items_with_matches
from ..services.arr_client import RadarrClient, SonarrClient, get_arr_config

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

@router.get("/{playlist_id}/items")
async def get_playlist_items(
    playlist_id: int,
    refresh: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    config = db.query(ListConfig).filter(ListConfig.id == playlist_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    if not current_user.is_admin and config.user_id != current_user.id and not config.is_global:
        raise HTTPException(status_code=403, detail="Not authorized to view this playlist's items")
        
    try:
        data = await get_playlist_items_with_matches(db, config, force_refresh=refresh)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load items: {str(e)}")

@router.post("/{playlist_id}/refresh-items")
async def refresh_playlist_items(
    playlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    config = db.query(ListConfig).filter(ListConfig.id == playlist_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    if not current_user.is_admin and config.user_id != current_user.id and not config.is_global:
        raise HTTPException(status_code=403, detail="Not authorized to refresh this playlist's items")
        
    try:
        data = await get_playlist_items_with_matches(db, config, force_refresh=True)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to refresh items: {str(e)}")

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


# --- Radarr & Sonarr Automation Endpoints ---

class AddToArrRequest(BaseModel):
    items: Optional[List[Dict[str, Any]]] = None
    target: Optional[str] = "both"  # "both" | "radarr" | "sonarr"

class AddSingleItemRequest(BaseModel):
    item: Dict[str, Any]
    target: Optional[str] = None  # "radarr" | "sonarr"

async def _process_add_item(item: Dict[str, Any], arr_cfg: Dict[str, Any], target_override: Optional[str] = None) -> Dict[str, Any]:
    m_type = (item.get("type") or "").lower()
    has_show = bool(item.get("show_title"))
    has_tvdb = bool(item.get("tvdb_id"))

    if target_override:
        dest = target_override.lower()
    elif m_type in ("show", "episode", "series") or has_show or has_tvdb:
        dest = "sonarr"
    else:
        dest = "radarr"

    if dest == "radarr":
        if not arr_cfg.get("radarr", {}).get("configured"):
            return {
                "title": item.get("title", "Unknown Movie"),
                "destination": "radarr",
                "status": "skipped",
                "message": "Radarr is not configured in Settings"
            }
        try:
            rc = RadarrClient(arr_cfg["radarr"]["url"], arr_cfg["radarr"]["api_key"])
            qp_id = arr_cfg["radarr"].get("quality_profile_id")
            if not qp_id:
                profiles = await rc.get_quality_profiles()
                if profiles:
                    qp_id = profiles[0]["id"]
                else:
                    return {
                        "title": item.get("title"),
                        "destination": "radarr",
                        "status": "failed",
                        "message": "No quality profiles found in Radarr"
                    }

            rf_path = arr_cfg["radarr"].get("root_folder_path")
            if not rf_path:
                folders = await rc.get_root_folders()
                if folders:
                    rf_path = folders[0]["path"]
                else:
                    return {
                        "title": item.get("title"),
                        "destination": "radarr",
                        "status": "failed",
                        "message": "No root folders found in Radarr"
                    }

            search_on_add = arr_cfg["radarr"].get("search_on_add", True)
            candidates = await rc.lookup_movie(
                title=item.get("title"),
                year=item.get("year"),
                tmdb_id=item.get("tmdb_id"),
                imdb_id=item.get("imdb_id")
            )
            if not candidates:
                return {
                    "title": item.get("title"),
                    "destination": "radarr",
                    "status": "not_found",
                    "message": "Movie not found in Radarr lookup"
                }

            res = await rc.add_movie(candidates[0], qp_id, rf_path, search_on_add)
            res["destination"] = "radarr"
            return res
        except Exception as e:
            return {
                "title": item.get("title"),
                "destination": "radarr",
                "status": "failed",
                "message": str(e)
            }

    elif dest == "sonarr":
        if not arr_cfg.get("sonarr", {}).get("configured"):
            return {
                "title": item.get("show_title") or item.get("title", "Unknown Series"),
                "destination": "sonarr",
                "status": "skipped",
                "message": "Sonarr is not configured in Settings"
            }
        try:
            sc = SonarrClient(arr_cfg["sonarr"]["url"], arr_cfg["sonarr"]["api_key"])
            qp_id = arr_cfg["sonarr"].get("quality_profile_id")
            if not qp_id:
                profiles = await sc.get_quality_profiles()
                if profiles:
                    qp_id = profiles[0]["id"]
                else:
                    return {
                        "title": item.get("show_title") or item.get("title"),
                        "destination": "sonarr",
                        "status": "failed",
                        "message": "No quality profiles found in Sonarr"
                    }

            rf_path = arr_cfg["sonarr"].get("root_folder_path")
            if not rf_path:
                folders = await sc.get_root_folders()
                if folders:
                    rf_path = folders[0]["path"]
                else:
                    return {
                        "title": item.get("show_title") or item.get("title"),
                        "destination": "sonarr",
                        "status": "failed",
                        "message": "No root folders found in Sonarr"
                    }

            search_on_add = arr_cfg["sonarr"].get("search_on_add", True)
            series_title = item.get("show_title") or item.get("title")
            candidates = await sc.lookup_series(
                title=series_title,
                tvdb_id=item.get("tvdb_id"),
                imdb_id=item.get("imdb_id")
            )
            if not candidates:
                return {
                    "title": series_title,
                    "destination": "sonarr",
                    "status": "not_found",
                    "message": "Series not found in Sonarr lookup"
                }

            res = await sc.add_series(candidates[0], qp_id, rf_path, search_on_add)
            res["destination"] = "sonarr"
            return res
        except Exception as e:
            return {
                "title": item.get("show_title") or item.get("title"),
                "destination": "sonarr",
                "status": "failed",
                "message": str(e)
            }
    else:
        return {
            "title": item.get("title", "Unknown"),
            "destination": dest,
            "status": "failed",
            "message": f"Unknown destination: {dest}"
        }

@router.post("/{playlist_id}/add-to-arr")
async def add_playlist_missing_to_arr(
    playlist_id: int,
    req: AddToArrRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Adds missing playlist items to Radarr/Sonarr."""
    config = db.query(ListConfig).filter(ListConfig.id == playlist_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Playlist not found")

    arr_cfg = get_arr_config(db)
    if not arr_cfg.get("radarr", {}).get("configured") and not arr_cfg.get("sonarr", {}).get("configured"):
        raise HTTPException(status_code=400, detail="Neither Radarr nor Sonarr is configured in Settings")

    # Determine items to add
    if req.items:
        items_to_process = req.items
    else:
        items_data = await get_playlist_items_with_matches(db, config)
        items_to_process = [it for it in items_data.get("items", []) if not it.get("matched")]

    if not items_to_process:
        return {
            "total_attempted": 0,
            "added": 0,
            "already_exists": 0,
            "skipped": 0,
            "failed": 0,
            "results": []
        }

    results = []
    seen_series = set()

    for item in items_to_process:
        # Deduplicate TV series so multiple missing episodes of the same show only add once
        m_type = (item.get("type") or "").lower()
        if m_type in ("show", "episode", "series") or item.get("show_title") or item.get("tvdb_id"):
            series_key = item.get("tvdb_id") or (item.get("show_title") or item.get("title") or "").lower().strip()
            if series_key in seen_series:
                results.append({
                    "title": item.get("show_title") or item.get("title"),
                    "destination": "sonarr",
                    "status": "already_exists",
                    "message": f"Show already sent in this batch"
                })
                continue
            seen_series.add(series_key)

        res = await _process_add_item(item, arr_cfg, target_override=req.target if req.target in ("radarr", "sonarr") else None)
        results.append(res)

    added_count = sum(1 for r in results if r.get("status") == "added")
    exists_count = sum(1 for r in results if r.get("status") == "already_exists")
    skipped_count = sum(1 for r in results if r.get("status") == "skipped")
    failed_count = sum(1 for r in results if r.get("status") in ("failed", "error", "not_found"))

    return {
        "total_attempted": len(results),
        "added": added_count,
        "already_exists": exists_count,
        "skipped": skipped_count,
        "failed": failed_count,
        "results": results
    }

@router.post("/add-item-to-arr")
async def add_single_item_to_arr(
    req: AddSingleItemRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Adds a single item directly to Radarr or Sonarr."""
    arr_cfg = get_arr_config(db)
    res = await _process_add_item(req.item, arr_cfg, target_override=req.target)
    return res

