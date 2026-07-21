from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
import datetime
from .database import Base

class Server(Base):
    __tablename__ = "servers"
    
    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, unique=True, index=True)
    server_type = Column(String) # "emby" or "jellyfin"
    name = Column(String, nullable=True)
    api_key = Column(String, nullable=True)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    is_admin = Column(Boolean, default=False)

class ListConfig(Base):
    __tablename__ = "list_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    provider = Column(String) # trakt, imdb, letterboxd, etc.
    source_url = Column(String)
    sort_order = Column(String, default="custom") # custom, date_added, rank
    is_global = Column(Boolean, default=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # Null if global
    
    user = relationship("User")

class SyncLog(Base):
    __tablename__ = "sync_logs"

    id = Column(Integer, primary_key=True, index=True)
    list_config_id = Column(Integer, ForeignKey("list_configs.id"))
    status = Column(String)
    last_sync = Column(DateTime, default=datetime.datetime.utcnow)
    details = Column(String, nullable=True)
