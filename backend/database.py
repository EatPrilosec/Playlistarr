from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

import os

def get_database_url():
    if os.getenv("DATABASE_URL"):
        return os.getenv("DATABASE_URL")
    if os.path.exists("/config"):
        # Auto-migrate legacy /app/data/playlistarr.db to /config/playlistarr.db if needed
        if not os.path.exists("/config/playlistarr.db") and os.path.exists("/app/data/playlistarr.db"):
            import shutil
            try:
                shutil.copy2("/app/data/playlistarr.db", "/config/playlistarr.db")
            except Exception as e:
                print(f"Error copying db from /app/data to /config: {e}")
        return "sqlite:////config/playlistarr.db"
    return "sqlite:////app/data/playlistarr.db"

DATABASE_URL = get_database_url()

# Ensure directory for sqlite db exists
if DATABASE_URL.startswith("sqlite:////"):
    db_file_path = DATABASE_URL[len("sqlite:////") - 1:]
    os.makedirs(os.path.dirname(db_file_path), exist_ok=True)
elif DATABASE_URL.startswith("sqlite:///"):
    db_file_path = DATABASE_URL[len("sqlite:///"):]
    if os.path.dirname(db_file_path):
        os.makedirs(os.path.dirname(db_file_path), exist_ok=True)

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
