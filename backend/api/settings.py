from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Server, User
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
