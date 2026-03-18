"""AMQP consumer loop for the ``kms.voice`` queue.

Connects to RabbitMQ via ``aio_pika.connect_robust()``, declares the voice
queue and dead-letter infrastructure, sets QoS prefetch, then delegates each
message to :class:`~app.handlers.transcription_handler.TranscriptionHandler`.

This module is started as a background asyncio task from the FastAPI lifespan
in :mod:`app.main`.
"""
from __future__ import annotations

import asyncio

import aio_pika
import structlog

from app.config import settings
from app.handlers.transcription_handler import TranscriptionHandler
from app.services.job_store import JobStore
from app.services.whisper_service import WhisperService

logger = structlog.get_logger(__name__)

# Module-level singleton — loaded once in lifespan.
_whisper_service: WhisperService = WhisperService()


def get_whisper_service() -> WhisperService:
    """Return the module-level WhisperService singleton.

    Returns:
        The pre-loaded :class:`~app.services.whisper_service.WhisperService`.
    """
    return _whisper_service


async def start_amqp_consumer() -> None:
    """Connect to RabbitMQ and consume messages from ``kms.voice`` indefinitely.

    Declares the dead-letter exchange, the ``kms.voice`` queue (bound to the
    DLX), and the ``kms.embed`` queue so messages can be published without a
    separate setup step.

    Runs until the asyncio task is cancelled (e.g. on FastAPI lifespan shutdown).

    Raises:
        asyncio.CancelledError: Propagated on graceful shutdown.
    """
    log = logger.bind(
        queue=settings.voice_queue,
        dlq=settings.voice_dlq,
        rabbitmq_url=settings.rabbitmq_url,
    )
    log.info("amqp_consumer_connecting")

    connection = await aio_pika.connect_robust(settings.rabbitmq_url)

    async with connection:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=settings.prefetch_count)

        # Declare dead-letter exchange
        dlx = await channel.declare_exchange(
            settings.dead_letter_exchange,
            aio_pika.ExchangeType.DIRECT,
            durable=True,
        )

        # Declare DLQ and bind it to the DLX
        dlq = await channel.declare_queue(
            settings.voice_dlq,
            durable=True,
        )
        await dlq.bind(dlx, routing_key=settings.voice_queue)

        # Declare main voice queue with DLX routing
        voice_queue = await channel.declare_queue(
            settings.voice_queue,
            durable=True,
            arguments={
                "x-dead-letter-exchange": settings.dead_letter_exchange,
                "x-dead-letter-routing-key": settings.voice_queue,
            },
        )

        # Declare embed queue so we can publish without a separate setup
        await channel.declare_queue(settings.embed_queue, durable=True)

        job_store = JobStore()
        handler = TranscriptionHandler(
            whisper_service=_whisper_service,
            job_store=job_store,
            channel=channel,
        )

        log.info("amqp_consumer_ready")

        try:
            async with voice_queue.iterator() as queue_iter:
                async for message in queue_iter:
                    await handler.handle(message)
        except asyncio.CancelledError:
            log.info("amqp_consumer_stopping")
            raise
