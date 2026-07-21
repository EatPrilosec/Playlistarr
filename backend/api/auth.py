from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from ..database import get_db
from ..models import User
import jwt
import datetime

router = APIRouter(prefix="/api/auth", tags=["auth"])
SECRET_KEY = "playlistarr_super_secret"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class SetupRequest(BaseModel):
    username: str
    password: str

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    token: str
    is_admin: bool

@router.get("/setup-status")
async def setup_status(db: Session = Depends(get_db)):
    user = db.query(User).first()
    return {"setupComplete": user is not None}

@router.post("/setup")
async def setup(req: SetupRequest, db: Session = Depends(get_db)):
    if db.query(User).first():
        raise HTTPException(status_code=400, detail="Setup already complete")
        
    hashed_password = pwd_context.hash(req.password)
    user = User(username=req.username, password_hash=hashed_password, is_admin=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Generate token
    token_payload = {
        "sub": user.id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }
    token = jwt.encode(token_payload, SECRET_KEY, algorithm="HS256")
    
    return LoginResponse(token=token, is_admin=True)

@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not pwd_context.verify(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
        
    token_payload = {
        "sub": user.id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }
    token = jwt.encode(token_payload, SECRET_KEY, algorithm="HS256")
    
    return LoginResponse(token=token, is_admin=user.is_admin)

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
