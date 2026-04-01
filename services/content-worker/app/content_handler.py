"""
ContentHandler — AMQP consumer for kms.content queue.

Responsibilities:
- Connect to RabbitMQ using connect_robust() (CLAUDE.md mandatory pattern)
- Declare kms.content queue + kms.content.dlx dead-letter exchange
- Route each message to PipelineRunner
- ACK on success, nack(requeue=False) for terminal errors (→ DLX),
  nack(requeue=True) for retryable errors (→ retry queue via DLX routing key)

Rate limiting for YouTube sources: Redis-backed per-channel limiter.
"""
import json
from typing import Any

import aio_pika
import aio_pika.abc
import structlog

from app.config import Settings
from app.errors import KMSContentError, UnsupportedSourceTypeError
from app.pipeline.runner import PipelineRunner

logger = structlog.get_logger(__name__)


class ContentHandler:
    """
    AMQP consumer for kms.content queue.

    Args:
        settings: Application configuration (database URL, queue names, etc.).
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._runner: PipelineRunner | None = None

    async def start(self) -> None:
        """
        Connect to RabbitMQ and start consuming from kms.content.

        Uses connect_robust() so the connection auto-reconnects on drop.
        This method blocks until the process is stopped.

        Raises:
            aio_pika.AMQPConnectionError: If initial connection fails after retries.
        """
        # connect_robust() is the CLAUDE.md mandatory pattern for AMQP connections.
        # It retries the initial connection and reconnects transparently on drops.
        connection = await aio_pika.connect_robust(
            self._settings.rabbitmq_url,
            client_properties={"connection_name": "content-worker"},
        )

        async with connection:
            channel = await connection.channel()
            await channel.set_qos(prefetch_count=self._settings.content_worker_concurrency)

            # Declare the dead-letter exchange first so the queue can reference it
            dlx = await channel.declare_exchange(
                self._settings.content_dlx,
                aio_pika.ExchangeType.DIRECT,
                durable=True,
            )

            # Declare the retry queue bound to the DLX.
            # Messages rejected from kms.content land here via the DLX routing key.
            retry_queue = await channel.declare_queue(
                self._settings.content_retry_queue,
                durable=True,
                arguments={
                    # After 60 seconds, retry messages are re-published to kms.content
                    "x-message-ttl": 60_000,
                    "x-dead-letter-exchange": "",
                    "x-dead-letter-routing-key": self._settings.content_queue,
                },
            )
            await retry_queue.bind(dlx, routing_key=self._settings.content_retry_queue)

            # Declare the main content queue with DLX binding.
            # Rejected messages (nack requeue=False) go to the DLX.
            queue = await channel.declare_queue(
                self._settings.content_queue,
                durable=True,
                arguments={
                    "x-dead-letter-exchange": self._settings.content_dlx,
                    "x-dead-letter-routing-key": self._settings.content_retry_queue,
                },
            )

            self._runner = PipelineRunner(self._settings)
            await self._runner.setup()

            logger.info(
                "content_worker_ready",
                queue=self._settings.content_queue,
                dlx=self._settings.content_dlx,
            )

            async with queue.iterator() as queue_iter:
                async for message in queue_iter:
                    await self._handle_message(message)

    async def _handle_message(
        self, message: aio_pika.abc.AbstractIncomingMessage
    ) -> None:
        """
        Process a single kms.content queue message.

        On success: ack the message.
        On retryable error: nack(requeue=False) → DLX → retry queue.
        On terminal error: nack(requeue=False) → DLX → retry queue (exhausted).

        Args:
            message: Incoming AMQP message from kms.content queue.
        """
        async with message.process(ignore_processed=True):
            body: dict[str, Any] = {}
            job_id = "unknown"

            try:
                body = json.loads(message.body)
                job_id = body.get("job_id", "unknown")

                log = logger.bind(job_id=job_id, source_type=body.get("source_type"))
                log.info("content_job_received")

                assert self._runner is not None, "Runner not initialised"
                await self._runner.run(body)

                log.info("content_job_completed")
                await message.ack()

            except UnsupportedSourceTypeError as exc:
                # Terminal — no point retrying an unknown source type
                logger.error(
                    "content_job_terminal_error",
                    job_id=job_id,
                    code=exc.code,
                    error=exc.message,
                )
                await message.nack(requeue=False)

            except KMSContentError as exc:
                if exc.retryable:
                    logger.warning(
                        "content_job_retryable_error",
                        job_id=job_id,
                        code=exc.code,
                        error=exc.message,
                    )
                    # nack(requeue=False) → DLX → retry queue (60s delay then re-enqueue)
                    await message.nack(requeue=False)
                else:
                    logger.error(
                        "content_job_terminal_error",
                        job_id=job_id,
                        code=exc.code,
                        error=exc.message,
                    )
                    await message.nack(requeue=False)

            except Exception as exc:  # noqa: BLE001
                # Unexpected exception — treat as terminal to avoid poison-pill loop
                logger.error(
                    "content_job_unexpected_error",
                    job_id=job_id,
                    error=str(exc),
                    exc_info=True,
                )
                await message.nack(requeue=False)
