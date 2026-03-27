"""
Graph Worker — Main consumer loop.

Connects to RabbitMQ, PostgreSQL (asyncpg), and Neo4j, then processes
graph-build jobs from the kms.graph queue.
"""

import asyncio
import signal

import aio_pika
import asyncpg
import structlog

from app.config import get_settings
from app.db.neo4j import create_neo4j_driver
from app.handlers.graph_handler import GraphHandler

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
    """Start the graph worker: connect to all backends, begin consuming messages.

    Registers OS signal handlers for SIGTERM and SIGINT to enable graceful shutdown.
    Blocks on the shutdown event; connections are closed cleanly on exit.
    """
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _handle_shutdown, sig.name)

    logger.info("Connecting to RabbitMQ", url=settings.rabbitmq_url.get_secret_value()[:30])
    connection = await aio_pika.connect_robust(settings.rabbitmq_url.get_secret_value())

    logger.info("Connecting to PostgreSQL")
    db_pool = await asyncpg.create_pool(
        settings.database_url.get_secret_value(),
        min_size=2,
        max_size=10,
    )

    logger.info("Connecting to Neo4j", uri=settings.neo4j_uri)
    neo4j_driver = await create_neo4j_driver(
        uri=settings.neo4j_uri,
        user=settings.neo4j_user,
        password=settings.neo4j_password.get_secret_value(),
    )

    async with connection:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=settings.prefetch_count)

        queue = await channel.declare_queue(
            settings.graph_queue,
            durable=True,
            arguments={
                "x-dead-letter-exchange": settings.dead_letter_exchange,
                "x-message-ttl": 3_600_000,  # 1 hour
            },
        )

        handler = GraphHandler(channel, db_pool, neo4j_driver)
        await queue.consume(handler.handle)

        logger.info("Graph worker ready — listening on queue", queue=settings.graph_queue)
        await _shutdown_event.wait()
        logger.info("Shutting down graph worker")

    await db_pool.close()
    await neo4j_driver.close()
    logger.info("Graph worker shut down cleanly")


if __name__ == "__main__":
    asyncio.run(run_worker())
