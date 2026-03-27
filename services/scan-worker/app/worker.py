"""
Scan Worker — Main consumer loop.
Connects to RabbitMQ and processes scan jobs from kms.scan queue.
"""
import asyncio
import signal

import aio_pika
import structlog

from app.config import get_settings
from app.handlers.scan_handler import ScanHandler

logger = structlog.get_logger(__name__)
settings = get_settings()

_shutdown_event = asyncio.Event()


def _handle_shutdown(sig_name: str) -> None:
    logger.info("Received signal — initiating graceful shutdown", signal=sig_name)
    _shutdown_event.set()


async def run_worker() -> None:
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _handle_shutdown, sig.name)

    logger.info("Connecting to RabbitMQ", url=settings.rabbitmq_url)
    connection = await aio_pika.connect_robust(settings.rabbitmq_url)

    async with connection:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=settings.prefetch_count)

        # Declare queue with dead-letter exchange
        queue = await channel.declare_queue(
            settings.scan_queue,
            durable=True,
            arguments={
                "x-dead-letter-exchange": settings.dead_letter_exchange,
                "x-message-ttl": 3_600_000,  # 1 hour
            },
        )

        handler = ScanHandler(channel)
        await queue.consume(handler.handle)

        logger.info("Scan worker ready — listening on queue", queue=settings.scan_queue)
        await _shutdown_event.wait()
        logger.info("Shutting down scan worker")


if __name__ == "__main__":
    asyncio.run(run_worker())
