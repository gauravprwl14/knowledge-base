"""Voice-app FastAPI service — audio/video transcription via Whisper.

OTel MUST be configured before any other application imports.
"""
from contextlib import asynccontextmanager

# OTel MUST be first import — before any route or service imports.
from app.telemetry import configure_telemetry

configure_telemetry("voice-app")

import asyncio  # noqa: E402

import asyncpg  # noqa: E402
import structlog  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from app.api.v1.router import api_router  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.services import job_store  # noqa: E402
from app.worker import get_whisper_service, start_amqp_consumer  # noqa: E402
from app.workers.job_consumer import run_consumer  # noqa: E402

logger = structlog.get_logger(__name__)
settings = get_settings()

_amqp_task: asyncio.Task | None = None
_poll_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan — load Whisper, set up DB pool, start AMQP + poll consumers.

    Startup order:
    1. Configure OTel (already done above at module level).
    2. Load the Whisper model (blocking, so done before yielding).
    3. Create the asyncpg connection pool (used by REST API endpoints).
    4. Start the AMQP consumer task (``kms.voice`` queue).
    5. Start the poll-based consumer task (DB-backed fallback consumer).

    Yields:
        Nothing — control returns to FastAPI during the ``yield``.
    """
    global _amqp_task, _poll_task

    # 1. Load Whisper model
    whisper = get_whisper_service()
    whisper.load()
    logger.info("whisper_model_ready", model=settings.whisper_model)

    # 2. Create asyncpg pool for REST API endpoints
    pool = await asyncpg.create_pool(settings.database_url, min_size=2, max_size=10)
    job_store.set_pool(pool)
    logger.info("db_pool_created", min_size=2, max_size=10)

    # 3. Start AMQP consumer (primary pipeline)
    _amqp_task = asyncio.create_task(start_amqp_consumer())

    # 4. Start poll-based consumer (legacy / fallback)
    _poll_task = asyncio.create_task(run_consumer())

    logger.info("voice_app_started", whisper_model=settings.whisper_model)

    yield

    # Shutdown — cancel background tasks gracefully.
    for task in (_amqp_task, _poll_task):
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    await pool.close()
    logger.info("voice_app_stopped")


app = FastAPI(
    title="KMS Voice App",
    version="1.0.0",
    description="Audio/video transcription service — Whisper-based, AMQP + async job queue",
    lifespan=lifespan,
)

app.include_router(api_router)


@app.get("/health", summary="Health check")
async def health() -> JSONResponse:
    """Return service health status and current Whisper model configuration.

    Returns:
        200 with ``{ "status": "ok", "service": "voice-app", "model": "<model>" }``.
    """
    return JSONResponse(
        {"status": "ok", "service": settings.service_name, "model": settings.whisper_model}
    )
