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

DATABASE_URL = get_database_url()

# Ensure directory for sqlite db exists
if DATABASE_URL.startswith("sqlite:////"):
    db_file_path = DATABASE_URL[len("sqlite:////") - 1:]
    try:
        os.makedirs(os.path.dirname(db_file_path), exist_ok=True)
    except Exception:
        pass
elif DATABASE_URL.startswith("sqlite:///"):
    db_file_path = DATABASE_URL[len("sqlite:///"):]
    if os.path.dirname(db_file_path):
        try:
            os.makedirs(os.path.dirname(db_file_path), exist_ok=True)
        except Exception:
            pass

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def run_migrations():
    try:
        with engine.connect() as conn:
            cursor = conn.connection.cursor()
            cursor.execute("PRAGMA table_info(list_configs)")
            cols = [col[1] for col in cursor.fetchall()]
            if cols:
                for col, col_type in [("image_url", "VARCHAR"), ("backdrop_url", "VARCHAR"), ("banner_url", "VARCHAR"), ("last_items_json", "TEXT")]:
                    if col not in cols:
                        cursor.execute(f"ALTER TABLE list_configs ADD COLUMN {col} {col_type}")
                conn.connection.commit()

            # Auto-detect and fix mismatched server_type in servers table
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='servers'")
            if cursor.fetchone():
                cursor.execute("SELECT id, url, server_type FROM servers")
                servers = cursor.fetchall()
                for s_id, s_url, s_type in servers:
                    if s_url and s_type == "emby":
                        try:
                            import httpx
                            resp = httpx.get(f"{s_url.rstrip('/')}/System/Info/Public", timeout=2.0)
                            if resp.status_code == 200:
                                prod = str(resp.json().get("ProductName", "")).lower()
                                srv_hdr = str(resp.headers.get("Server", "")).lower()
                                if "jellyfin" in prod or "jellyfin" in srv_hdr:
                                    cursor.execute("UPDATE servers SET server_type = 'jellyfin' WHERE id = ?", (s_id,))
                                    conn.connection.commit()
                        except Exception:
                            pass
    except Exception as e:
        print(f"Migration notice: {e}")

run_migrations()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

