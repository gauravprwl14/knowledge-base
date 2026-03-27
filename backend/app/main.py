# Hot reload test - Testing polling-based file watching with Podman
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import asyncio
import logging
from datetime import datetime

from alembic.config import Config as AlembicConfig
from alembic import command as alembic_command

from app.config import get_settings
from app.api.v1.router import api_router
from app.db.session import engine
from app.services.job_monitor import JobMonitor
from app.utils.errors import AppException, ErrorType, ErrorCategory


settings = get_settings()
logger = logging.getLogger(__name__)

# Global job monitor instance
job_monitor = None
monitor_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global job_monitor, monitor_task
    
    # Startup: Run Alembic migrations (production-safe, idempotent)
    logger.info("Running database migrations...")
    alembic_cfg = AlembicConfig("/app/alembic.ini")
    alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url.replace(
        "postgresql://", "postgresql+asyncpg://", 1
    ) if settings.database_url.startswith("postgresql://") else settings.database_url)
    await asyncio.to_thread(alembic_command.upgrade, alembic_cfg, "head")
    logger.info("Database migrations complete")

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

# Custom exception handlers for standard error format
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    """Handle custom AppException with standard error format"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "errors": [{
                "errorCode": exc.error_code,
                "message": exc.detail or exc.error_definition.message,
                "type": exc.error_definition.type.value,
                "category": exc.error_definition.category.value,
                "data": exc.data or {}
            }],
            "meta": {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "path": request.url.path
            }
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle Pydantic validation errors with standard error format"""
    # Extract field errors
    field_errors = {}
    for error in exc.errors():
        field = ".".join(str(x) for x in error["loc"][1:])  # Skip 'body'
        field_errors[field] = error["msg"]
    
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "errors": [{
                "errorCode": "VAL1000",
                "message": "Validation error",
                "type": ErrorType.VALIDATION_ERROR.value,
                "category": ErrorCategory.INPUT_VALIDATION.value,
                "data": {
                    "fields": field_errors
                }
            }],
            "meta": {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "path": request.url.path
            }
        }
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions with standard error format"""
    logger.error(f"Unexpected error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "errors": [{
                "errorCode": "SYS9000",
                "message": "Internal server error",
                "type": ErrorType.INTERNAL_ERROR.value,
                "category": ErrorCategory.SYSTEM.value,
                "data": {}
            }],
            "meta": {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "path": request.url.path
            }
        }
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
