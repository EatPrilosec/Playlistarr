from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import httpx
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, Server
import jwt
import datetime

router = APIRouter(prefix="/api/auth", tags=["auth"])
SECRET_KEY = "playlistarr_super_secret" # In prod, load from env

class LoginRequest(BaseModel):
    server_url: str
    username: str
    password: str

class LoginResponse(BaseModel):
    token: str
    is_admin: bool

@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    url = req.server_url.rstrip("/")
    auth_url = f"{url}/Users/AuthenticateByName"
    
    headers = {
        "X-Emby-Authorization": 'MediaBrowser Client="Playlistarr", Device="Web", DeviceId="playlistarr-web", Version="1.0.0"',
        "Content-Type": "application/json"
    }
    
    payload = {
        "Username": req.username,
        "Pw": req.password
    }
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(auth_url, json=payload, headers=headers)
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid credentials or server URL")
            
            data = resp.json()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to connect to server: {str(e)}")
            
    access_token = data.get("AccessToken")
    user_info = data.get("User", {})
    is_admin = user_info.get("Policy", {}).get("IsAdministrator", False)
    username = user_info.get("Name", req.username)
    
    # Store or update Server
    server = db.query(Server).filter(Server.url == url).first()
    if not server:
        # We can try to guess if it's Emby or Jellyfin, assume Emby by default
        server = Server(url=url, server_type="emby", name=url)
        db.add(server)
        db.commit()
        db.refresh(server)
        
    # Store or update User
    user = db.query(User).filter(User.username == username, User.server_id == server.id).first()
    if not user:
        user = User(username=username, server_id=server.id, is_admin=is_admin, api_key=access_token)
        db.add(user)
    else:
        user.api_key = access_token
        user.is_admin = is_admin
        
    db.commit()
    db.refresh(user)
    
    # Create JWT
    token_payload = {
        "sub": user.id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }
    token = jwt.encode(token_payload, SECRET_KEY, algorithm="HS256")
    
    return LoginResponse(token=token, is_admin=is_admin)

def get_current_user(token: str, db: Session = Depends(get_db)):
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
