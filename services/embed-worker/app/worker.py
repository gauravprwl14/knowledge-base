import asyncio
import signal

import aio_pika
import asyncpg
import structlog

from app.config import get_settings
from app.handlers.embed_handler import EmbedHandler

logger = structlog.get_logger(__name__)
settings = get_settings()
_shutdown_event = asyncio.Event()


def _handle_shutdown(sig_name: str) -> None:
    logger.info("Received signal — shutting down embed-worker", signal=sig_name)
    _shutdown_event.set()


async def run_worker() -> None:
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _handle_shutdown, sig.name)

    db_pool = await asyncpg.create_pool(settings.database_url, min_size=2, max_size=10)
    connection = await aio_pika.connect_robust(settings.rabbitmq_url)

    async with connection:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=settings.prefetch_count)

        queue = await channel.declare_queue(
            settings.embed_queue,
            durable=True,
            arguments={"x-dead-letter-exchange": settings.dead_letter_exchange},
        )

        handler = EmbedHandler(db_pool)
        await queue.consume(handler.handle)

        logger.info("Embed worker ready", queue=settings.embed_queue)
        await _shutdown_event.wait()

    await db_pool.close()
