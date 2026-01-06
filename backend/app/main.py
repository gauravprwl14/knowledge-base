# Hot reload test - Testing polling-based file watching with Podman
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging

from app.config import get_settings
from app.api.v1.router import api_router
from app.db.session import engine, Base
from app.services.job_monitor import JobMonitor


settings = get_settings()
logger = logging.getLogger(__name__)

# Global job monitor instance
job_monitor = None
monitor_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global job_monitor, monitor_task
    
    # Startup: Create database tables
    logger.info("Creating database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created")

    # Start job monitor if enabled
    if settings.enable_job_scheduler:
        logger.info(f"Job monitor is enabled (timeout={settings.job_timeout_minutes}m, interval={settings.scheduler_check_interval_seconds}s)")
        logger.info("Starting job monitor service...")
        job_monitor = JobMonitor()
        monitor_task = asyncio.create_task(job_monitor.run())
        logger.info("Job monitor task created")
    else:
        logger.info("Job monitor is disabled in configuration")

    yield

    # Shutdown: Stop job monitor
    if job_monitor:
        logger.info("Stopping job monitor...")
        await job_monitor.stop()
        if monitor_task:
            try:
                await asyncio.wait_for(monitor_task, timeout=10.0)
                logger.info("Job monitor stopped successfully")
            except asyncio.TimeoutError:
                logger.warning("Job monitor did not stop gracefully")
                monitor_task.cancel()

    # Cleanup
    logger.info("Disposing database engine...")
    await engine.dispose()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.app_name,
    openapi_url=f"{settings.api_v1_prefix}/openapi.json",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": settings.app_name}
