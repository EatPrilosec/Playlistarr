from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB
    from .database import engine, SessionLocal
    from .models import Base
    Base.metadata.create_all(bind=engine)
    
    # Startup: Start APScheduler
    print("Starting background sync engine...")
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from .services.sync_engine import run_sync_all
    
    scheduler = AsyncIOScheduler()
    
    async def sync_job():
        db = SessionLocal()
        try:
            await run_sync_all(db)
        finally:
            db.close()
            
    scheduler.add_job(sync_job, 'interval', hours=1)
    scheduler.start()
    
    yield
    # Shutdown: Stop APScheduler
    print("Shutting down background sync engine...")
    scheduler.shutdown()

app = FastAPI(title="Playlistarr API", lifespan=lifespan)

# Allow React app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from .api.auth import router as auth_router
from .api.playlists import router as playlists_router
from .api.settings import router as settings_router
app.include_router(auth_router)
app.include_router(playlists_router)
app.include_router(settings_router)

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi import HTTPException

# Serve built frontend
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")

if os.path.exists(frontend_dist):
    # Mount assets folder explicitly if it exists
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
        
    @app.get("/{catchall:path}")
    async def serve_frontend(catchall: str):
        if catchall.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
            
        file_path = os.path.join(frontend_dist, catchall)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
            
        return FileResponse(os.path.join(frontend_dist, "index.html"))
