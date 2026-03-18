"""RAG Service — FastAPI app with LangGraph orchestration."""
from contextlib import asynccontextmanager

# OTel MUST be configured before any other imports
from app.telemetry import configure_telemetry
configure_telemetry("rag-service")

import asyncpg
import redis.asyncio as aioredis
import structlog
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.api.v1.router import api_router
from app.services.run_store import RunStore

logger = structlog.get_logger(__name__)
settings = get_settings()

db_pool: asyncpg.Pool | None = None
redis_client: aioredis.Redis | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool, redis_client

    db_pool = await asyncpg.create_pool(settings.database_url, min_size=2, max_size=10)
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)

    # Ensure kms_rag_runs table exists on startup
    run_store = RunStore(db_pool)
    await run_store.ensure_table()

    logger.info("RAG service started", llm_enabled=settings.llm_enabled, llm_provider=settings.llm_provider)
    yield

    if db_pool:
        await db_pool.close()
    if redis_client:
        await redis_client.aclose()
    logger.info("RAG service stopped")


app = FastAPI(
    title="KMS RAG Service",
    version="1.0.0",
    description="Retrieval-Augmented Generation — LangGraph orchestrator for the KMS knowledge base",
    lifespan=lifespan,
)

app.include_router(api_router)


@app.get("/health/live")
async def live() -> JSONResponse:
    return JSONResponse({"status": "live", "service": "rag-service"})


@app.get("/health/ready")
async def ready() -> JSONResponse:
    db_ok = db_pool is not None
    redis_ok = redis_client is not None
    ok = db_ok and redis_ok
    return JSONResponse(
        {"status": "ready" if ok else "not_ready", "db": db_ok, "redis": redis_ok},
        status_code=200 if ok else 503,
    )
