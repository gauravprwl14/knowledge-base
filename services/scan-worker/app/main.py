"""
Scan Worker — FastAPI health & metrics endpoint.
Runs alongside the worker process (separate thread / process).
"""
import asyncio
import structlog
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.telemetry import configure_telemetry

settings = get_settings()
configure_telemetry(settings.service_name)

from app.worker import run_worker  # noqa: E402 — must be after configure_telemetry

logger = structlog.get_logger(__name__)

_worker_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _worker_task
    _worker_task = asyncio.create_task(run_worker())
    logger.info("Scan worker task started")
    yield
    if _worker_task:
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="KMS Scan Worker",
    version="1.0.0",
    docs_url="/docs",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({
        "status": "healthy",
        "service": settings.service_name,
        "queue": settings.scan_queue,
    })


@app.get("/health/ready")
async def ready() -> JSONResponse:
    worker_alive = _worker_task is not None and not _worker_task.done()
    return JSONResponse(
        {"status": "ready" if worker_alive else "not_ready", "worker": worker_alive},
        status_code=200 if worker_alive else 503,
    )
