"""
Graph Worker — FastAPI health & metrics endpoint.

Runs the AMQP consumer as an asyncio task alongside the FastAPI application.
Telemetry must be configured before any AMQP or route imports.
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
    """Manage the worker task lifecycle alongside the FastAPI app.

    Starts the AMQP consumer on startup and cancels it cleanly on shutdown.

    Args:
        app: The FastAPI application instance (required by asynccontextmanager protocol).

    Yields:
        None: Control is yielded back to FastAPI during the serving phase.
    """
    global _worker_task
    _worker_task = asyncio.create_task(run_worker())
    logger.info("Graph worker task started")
    yield
    if _worker_task:
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
    logger.info("Graph worker task stopped")


app = FastAPI(
    title="KMS Graph Worker",
    version="1.0.0",
    docs_url="/docs",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> JSONResponse:
    """Return basic liveness information for the graph-worker service.

    Returns:
        JSONResponse: Service name and queue being consumed.
    """
    return JSONResponse({
        "status": "healthy",
        "service": settings.service_name,
        "queue": settings.graph_queue,
    })


@app.get("/health/ready")
async def ready() -> JSONResponse:
    """Return readiness status — reports 503 when the worker task has died.

    Returns:
        JSONResponse: Ready/not_ready status with HTTP 200 or 503.
    """
    worker_alive = _worker_task is not None and not _worker_task.done()
    return JSONResponse(
        {"status": "ready" if worker_alive else "not_ready", "worker": worker_alive},
        status_code=200 if worker_alive else 503,
    )
