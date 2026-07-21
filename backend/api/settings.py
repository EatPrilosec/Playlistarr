from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Server, User
from .auth import get_current_user

router = APIRouter(prefix="/api/settings/servers", tags=["settings"])

class ServerRequest(BaseModel):
    url: str
    server_type: str
    name: str
    api_key: str

@router.get("/")
async def get_servers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can manage servers")
        
    return db.query(Server).all()

@router.post("/")
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

@router.delete("/{server_id}")
async def delete_server(server_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403)
        
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404)
        
    db.delete(server)
    db.commit()
    return {"status": "ok"}
