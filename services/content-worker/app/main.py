"""
content-worker entry point.

Connects to RabbitMQ using connect_robust() (auto-reconnects on drops),
declares the kms.content queue + dead-letter exchange, and starts consuming.

Exits with code 1 if CONTENT_MODULE_ENABLED is false so docker-compose
restart: unless-stopped does not thrash.
"""
import asyncio
import sys

import structlog

from app.config import settings
from app.content_handler import ContentHandler
from app.observability import configure_telemetry

logger = structlog.get_logger(__name__)


async def main() -> None:
    """
    Bootstrap the content-worker AMQP consumer.

    Raises:
        SystemExit: If CONTENT_MODULE_ENABLED is false (clean exit, no restart).
    """
    if not settings.content_module_enabled:
        logger.info("content_worker_disabled", reason="CONTENT_MODULE_ENABLED=false")
        sys.exit(0)

    configure_telemetry()

    logger.info(
        "content_worker_starting",
        queue=settings.content_queue,
        concurrency=settings.content_worker_concurrency,
    )

    handler = ContentHandler(settings)
    await handler.start()


if __name__ == "__main__":
    asyncio.run(main())
