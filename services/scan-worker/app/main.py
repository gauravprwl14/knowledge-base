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


def _on_worker_done(task: asyncio.Task) -> None:
    """Log unhandled exceptions from the worker task immediately.

    Attaching this as a done-callback ensures that if ``run_worker()``
    raises, the exception is surfaced in the log at the moment it occurs
    rather than being silently stored inside the task object forever.
    """
    if task.cancelled():
        logger.warning("Worker task was cancelled unexpectedly")
        return
    exc = task.exception()
    if exc is not None:
        logger.error(
            "Worker task crashed — consumer is NOT running",
            error=str(exc),
            error_type=type(exc).__name__,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _worker_task
    _worker_task = asyncio.create_task(run_worker())
    _worker_task.add_done_callback(_on_worker_done)

    # Wait up to 10 s to confirm the worker connected (task stays alive = success).
    # A TimeoutError means the task is still running — that is the happy path.
    # Any other exception means the worker failed to start and we abort.
    try:
        await asyncio.wait_for(asyncio.shield(_worker_task), timeout=10.0)
    except asyncio.TimeoutError:
        pass  # normal — worker is alive and blocking on _shutdown_event
    except Exception as exc:
        logger.error("Worker failed to start", error=str(exc))
        raise RuntimeError(f"Worker startup failed: {exc}") from exc

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
