from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.orm import Session
import bcrypt
from ..database import get_db
from ..models import User
import jwt
import datetime

router = APIRouter(prefix="/api/auth", tags=["auth"])
SECRET_KEY = "playlistarr_super_secret"

import httpx
from ..models import Server

class SetupRequest(BaseModel):
    username: str
    password: str

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    token: str
    is_admin: bool
    username: str

@router.get("/setup-status")
async def setup_status(db: Session = Depends(get_db)):
    user = db.query(User).first()
    return {"setupComplete": user is not None}

@router.post("/setup")
async def setup(req: SetupRequest, db: Session = Depends(get_db)):
    if db.query(User).first():
        raise HTTPException(status_code=400, detail="Setup already complete")
        
    hashed_password = bcrypt.hashpw(req.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user = User(username=req.username, password_hash=hashed_password, is_admin=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Generate long-lived token (1 year)
    token_payload = {
        "sub": user.id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=365)
    }
    token = jwt.encode(token_payload, SECRET_KEY, algorithm="HS256")
    
    return LoginResponse(token=token, is_admin=True, username=user.username)

@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    # 1. Check local user account first (e.g. initial Admin created during setup)
    user = db.query(User).filter(User.username == req.username).first()
    if user and user.password_hash and user.password_hash != "emby_authenticated":
        if bcrypt.checkpw(req.password.encode('utf-8'), user.password_hash.encode('utf-8')):
            token_payload = {
                "sub": user.id,
                "exp": datetime.datetime.utcnow() + datetime.timedelta(days=365)
            }
            token = jwt.encode(token_payload, SECRET_KEY, algorithm="HS256")
            return LoginResponse(token=token, is_admin=user.is_admin, username=user.username)

    # 2. Check configured media servers (Emby & Jellyfin)
    servers = db.query(Server).all()
    auth_success = False
    is_admin = False
    auth_username = req.username

    headers = {
        "X-Emby-Authorization": 'MediaBrowser Client="Playlistarr", Device="Web", DeviceId="playlistarr-web", Version="1.0.0"',
        "Content-Type": "application/json"
    }
    payload = {
        "Username": req.username,
        "Pw": req.password
    }

    async with httpx.AsyncClient(timeout=5.0) as client:
        for server in servers:
            try:
                auth_url = f"{server.url.rstrip('/')}/Users/AuthenticateByName"
                resp = await client.post(auth_url, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    user_info = data.get("User", {})
                    is_admin = user_info.get("Policy", {}).get("IsAdministrator", False)
                    auth_username = user_info.get("Name", req.username)
                    auth_success = True
                    break
            except Exception:
                continue

    if not auth_success:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Provision or update user from media server
    if not user:
        user = db.query(User).filter(User.username == auth_username).first()
    if not user:
        user = User(username=auth_username, password_hash="emby_authenticated", is_admin=is_admin)
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if is_admin and not user.is_admin:
            user.is_admin = True
            db.commit()

    token_payload = {
        "sub": user.id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=365)
    }
    token = jwt.encode(token_payload, SECRET_KEY, algorithm="HS256")
    return LoginResponse(token=token, is_admin=user.is_admin, username=user.username)

@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "is_admin": current_user.is_admin
    }

from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401)
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401)
    return user
