"""
Dedup Worker — Main consumer loop.

Connects to RabbitMQ, Redis, and PostgreSQL then processes duplicate-check
jobs from the kms.dedup queue.
"""

import asyncio
import signal

import aio_pika
import asyncpg
import redis.asyncio as aioredis
import structlog

from app.config import get_settings
from app.handlers.dedup_handler import DedupHandler

logger = structlog.get_logger(__name__)
settings = get_settings()

_shutdown_event = asyncio.Event()


def _handle_shutdown(sig_name: str) -> None:
    """Set the shutdown event on receipt of SIGTERM or SIGINT.

    Args:
        sig_name: Human-readable signal name for log output.
    """
    logger.info("Received signal — initiating graceful shutdown", signal=sig_name)
    _shutdown_event.set()


async def run_worker() -> None:
    """Start the dedup worker: connect to all backends, begin consuming messages.

    Registers OS signal handlers for SIGTERM and SIGINT to enable graceful shutdown.
    Blocks on the shutdown event; connections are closed cleanly on exit.
    """
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _handle_shutdown, sig.name)

    logger.info("Connecting to RabbitMQ", url=settings.rabbitmq_url.get_secret_value()[:30])
    connection = await aio_pika.connect_robust(settings.rabbitmq_url.get_secret_value())

    logger.info("Connecting to Redis", url=settings.redis_url)
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=False)

    logger.info("Connecting to PostgreSQL")
    db_pool = await asyncpg.create_pool(
        settings.database_url.get_secret_value(),
        min_size=2,
        max_size=10,
    )

    async with connection:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=settings.prefetch_count)

        queue = await channel.declare_queue(
            settings.dedup_queue,
            durable=True,
            arguments={
                "x-dead-letter-exchange": settings.dead_letter_exchange,
                "x-message-ttl": 3_600_000,  # 1 hour
            },
        )

        handler = DedupHandler(channel, redis_client, db_pool)
        await queue.consume(handler.handle)

        logger.info("Dedup worker ready — listening on queue", queue=settings.dedup_queue)
        await _shutdown_event.wait()
        logger.info("Shutting down dedup worker")

    await redis_client.aclose()
    await db_pool.close()
    logger.info("Dedup worker shut down cleanly")


if __name__ == "__main__":
    asyncio.run(run_worker())
