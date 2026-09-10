from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
import os
import httpx
import datetime
from ..database import get_db
from ..models import Server, User, AppSetting
from .auth import get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])

class ServerRequest(BaseModel):
    url: str
    server_type: str
    name: str
    api_key: str

@router.get("/servers")
async def get_servers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can manage servers")
        
    return db.query(Server).all()

@router.get("/servers/users")
async def get_server_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Fetches unique usernames across all configured media servers"""
    servers = db.query(Server).all()
    unique_usernames = set()
    
    from ..services.media_server import MediaServerClient
    
    for server in servers:
        if server.api_key:
            client = MediaServerClient(server.url, server.api_key)
            try:
                users = await client.get_users()
                for u in users:
                    if u.get("Name"):
                        unique_usernames.add(u["Name"])
            except Exception as e:
                print(f"Failed to fetch users from {server.url}: {e}")
                
    return sorted(list(unique_usernames))
@router.get("/sync-interval")
async def get_sync_interval(db: Session = Depends(get_db)):
    from ..models import AppSetting
    setting = db.query(AppSetting).filter(AppSetting.key == "sync_interval").first()
    return {"interval_hours": int(setting.value) if setting else 1}

class SyncIntervalRequest(BaseModel):
    interval_hours: int

@router.put("/sync-interval")
async def update_sync_interval(req: SyncIntervalRequest, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403)
        
    from ..models import AppSetting
    setting = db.query(AppSetting).filter(AppSetting.key == "sync_interval").first()
    if not setting:
        setting = AppSetting(key="sync_interval", value=str(req.interval_hours))
        db.add(setting)
    else:
        setting.value = str(req.interval_hours)
    
    db.commit()
    
    # Reschedule job
    scheduler = request.app.state.scheduler
    scheduler.reschedule_job('sync_job', trigger='interval', hours=req.interval_hours)
    
    return {"status": "ok"}

@router.post("/servers/test")
async def test_server(req: ServerRequest, current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403)
        
    from ..services.media_server import MediaServerClient
    client = MediaServerClient(req.url.rstrip("/"), req.api_key)
    try:
        await client.get_users()
        return {"status": "ok", "message": "Connection successful"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")

@router.post("/servers")
async def add_server(req: ServerRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403)
        
    server = Server(
        url=req.url.rstrip("/"),
        server_type=req.server_type,
        name=req.name,
        api_key=req.api_key
    )
    db.add(server)
    db.commit()
    db.refresh(server)
    return server

@router.put("/servers/{server_id}")
async def update_server(server_id: int, req: ServerRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403)
        
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404)
        
    server.url = req.url.rstrip("/")
    server.server_type = req.server_type
    server.name = req.name
    server.api_key = req.api_key
    
    db.commit()
    db.refresh(server)
    return server

@router.delete("/servers/{server_id}")
async def delete_server(server_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403)
        
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404)
        
    db.delete(server)
    db.commit()
    return {"status": "ok"}

# --- Trakt Device Code OAuth Endpoints ---

class PollTokenRequest(BaseModel):
    device_code: str

@router.get("/trakt/status")
async def get_trakt_status(db: Session = Depends(get_db)):
    token_setting = db.query(AppSetting).filter(AppSetting.key == "trakt_access_token").first()
    username_setting = db.query(AppSetting).filter(AppSetting.key == "trakt_username").first()
    is_connected = bool(token_setting and token_setting.value)
    return {
        "connected": is_connected,
        "username": username_setting.value if (is_connected and username_setting) else None
    }

@router.post("/trakt/device-code")
async def create_trakt_device_code(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
        
    client_id = os.getenv("TRAKT_CLIENT_ID", "201dc70c5ec6af530f12f079ea1922733f6e1085ad7b02f36d8e011b75bcea7d")
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(
                "https://api.trakt.tv/oauth/device/code",
                json={"client_id": client_id},
                headers={"Content-Type": "application/json"}
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=f"Trakt API error: {resp.text[:100]}")
            data = resp.json()
            return {
                "device_code": data["device_code"],
                "user_code": data["user_code"],
                "verification_url": data.get("verification_url", "https://auth.trakt.tv/activate"),
                "expires_in": data.get("expires_in", 600),
                "interval": data.get("interval", 5)
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@router.post("/trakt/poll-token")
async def poll_trakt_token(req: PollTokenRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
        
    client_id = os.getenv("TRAKT_CLIENT_ID", "201dc70c5ec6af530f12f079ea1922733f6e1085ad7b02f36d8e011b75bcea7d")
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(
                "https://api.trakt.tv/oauth/device/token",
                json={"client_id": client_id, "code": req.device_code},
                headers={"Content-Type": "application/json"}
            )
            if resp.status_code == 200:
                token_data = resp.json()
                access_token = token_data.get("access_token")
                refresh_token = token_data.get("refresh_token")
                expires_in = token_data.get("expires_in", 7776000)
                
                expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)
                
                # Fetch profile for username
                username = "TraktUser"
                profile_resp = await client.get(
                    "https://api.trakt.tv/users/me",
                    headers={
                        "Content-Type": "application/json",
                        "trakt-api-version": "2",
                        "trakt-api-key": client_id,
                        "Authorization": f"Bearer {access_token}"
                    }
                )
                if profile_resp.status_code == 200:
                    username = profile_resp.json().get("username") or username
                    
                # Save to AppSetting
                settings_to_update = {
                    "trakt_access_token": access_token,
                    "trakt_refresh_token": refresh_token,
                    "trakt_username": username,
                    "trakt_token_expires_at": expires_at.isoformat()
                }
                for k, v in settings_to_update.items():
                    s = db.query(AppSetting).filter(AppSetting.key == k).first()
                    if not s:
                        s = AppSetting(key=k, value=str(v))
                        db.add(s)
                    else:
                        s.value = str(v)
                db.commit()
                return {"status": "authorized", "username": username}
            elif resp.status_code == 400:
                return {"status": "pending"}
            elif resp.status_code in [404, 409, 410, 418]:
                return {"status": "expired", "detail": "Activation code expired or denied"}
            elif resp.status_code == 429:
                return {"status": "slow_down"}
            else:
                return {"status": "error", "detail": f"HTTP {resp.status_code}"}
        except Exception as e:
            return {"status": "error", "detail": str(e)}

@router.post("/trakt/disconnect")
async def disconnect_trakt(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
        
    keys = ["trakt_access_token", "trakt_refresh_token", "trakt_username", "trakt_token_expires_at"]
    for k in keys:
        s = db.query(AppSetting).filter(AppSetting.key == k).first()
        if s:
            db.delete(s)
    db.commit()
    return {"status": "ok", "connected": False}

