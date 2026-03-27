import json
import aio_pika
from typing import Optional
from datetime import datetime

from app.config import get_settings
from app.db.models import Job, JobStatus

settings = get_settings()


class JobService:
    """Service for managing transcription jobs and queue operations."""

    EXCHANGE_NAME = "voice_app.direct"
    TRANSCRIPTION_QUEUE = "transcription.queue"
    TRANSLATION_QUEUE = "translation.queue"
    PRIORITY_QUEUE = "priority.queue"

    def __init__(self):
        self._connection = None
        self._channel = None

    async def _get_connection(self):
        """Get or create RabbitMQ connection."""
        if self._connection is None or self._connection.is_closed:
            self._connection = await aio_pika.connect_robust(settings.rabbitmq_url)
        return self._connection

    async def _get_channel(self):
        """Get or create channel."""
        connection = await self._get_connection()
        if self._channel is None or self._channel.is_closed:
            self._channel = await connection.channel()
            # Declare exchange
            await self._channel.declare_exchange(
                self.EXCHANGE_NAME,
                aio_pika.ExchangeType.DIRECT,
                durable=True
            )
        return self._channel

    async def queue_job(self, job: Job):
        """
        Add a job to the processing queue.

        Args:
            job: Job model instance to queue
            
        Raises:
            Exception: If publishing to queue fails
        """
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            channel = await self._get_channel()
            exchange = await channel.get_exchange(self.EXCHANGE_NAME)

            # Determine queue based on priority
            if job.priority >= 5:
                routing_key = "priority"
            else:
                routing_key = "transcription"

            message_body = {
                "job_id": str(job.id),
                "file_path": job.file_path,
                "provider": job.provider,
                "model": job.model_name,
                "language": job.language,
                "target_language": job.target_language,
                "webhook_url": job.webhook_url,
                "priority": job.priority
            }

            message = aio_pika.Message(
                body=json.dumps(message_body).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                priority=job.priority
            )

            await exchange.publish(message, routing_key=routing_key)
            logger.info(f"Job {job.id} published to queue '{routing_key}'")
            
        except Exception as e:
            logger.error(f"Failed to queue job {job.id}: {str(e)}", exc_info=True)
            raise

    async def close(self):
        """Close connection."""
        if self._channel and not self._channel.is_closed:
            await self._channel.close()
        if self._connection and not self._connection.is_closed:
            await self._connection.close()


# Global job service instance
_job_service: Optional[JobService] = None


def get_job_service() -> JobService:
    """Get the global job service instance."""
    global _job_service
    if _job_service is None:
        _job_service = JobService()
    return _job_service
