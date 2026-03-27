"""url-agent FastAPI application entry point.

Follows KMS Python service patterns:
- structlog for structured logging
- OTel telemetry configured before route imports
- Lifespan context manager for startup/shutdown
- Health check endpoint
"""
from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api.v1.router import router as v1_router

logger = structlog.get_logger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown hooks.

    Args:
        app: The FastAPI application instance (provided by the framework).
    """
    # Log startup configuration so ops can confirm settings at a glance
    logger.info(
        "url-agent starting",
        port=settings.port,
        mock_youtube=settings.mock_youtube,
        mock_web=settings.mock_web,
        otel_enabled=settings.otel_enabled,
    )
    yield
    # Teardown: release any shared resources (aio-pika connections, etc.)
    logger.info("url-agent shutting down")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    Returns:
        Configured FastAPI application with middleware, health check, and API routes.
    """
    app = FastAPI(
        title="KMS url-agent",
        description="URL content extraction service — YouTube transcripts and web pages",
        version="1.0.0",
        lifespan=lifespan,
    )

    # Configure OTel before registering routes so auto-instrumentation works
    from app.telemetry import configure_telemetry
    configure_telemetry(app)

    # CORS — open in development; tighten in production via env var
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health check — no auth, always first, used by Docker HEALTHCHECK and load balancers
    @app.get("/health", tags=["Health"])
    async def health():
        """Service liveness check.

        Returns:
            JSON with status and service name.
        """
        return {"status": "ok", "service": "url-agent"}

    # Mount all v1 API routes under /api/v1
    app.include_router(v1_router, prefix="/api/v1")

    return app


# Module-level app instance consumed by uvicorn and tests
app = create_app()

if __name__ == "__main__":
    # Direct execution: `python -m app.main` — useful for debugging
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)
