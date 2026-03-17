from contextlib import asynccontextmanager
import asyncio

import structlog
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.telemetry import configure_telemetry

settings = get_settings()
configure_telemetry(settings.service_name)

from app.worker import run_worker  # noqa: E402 — must be after configure_telemetry

logger = structlog.get_logger(__name__)
_worker_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _worker_task
    _worker_task = asyncio.create_task(run_worker())
    logger.info("Embed worker task started")
    yield
    if _worker_task:
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="KMS Embed Worker", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return JSONResponse({"status": "healthy", "service": settings.service_name})


@app.get("/health/ready")
async def ready():
    alive = _worker_task is not None and not _worker_task.done()
    return JSONResponse(
        {"status": "ready" if alive else "not_ready"},
        status_code=200 if alive else 503,
    )
