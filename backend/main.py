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
app.include_router(auth_router)
app.include_router(playlists_router)

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
