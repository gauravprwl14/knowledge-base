import asyncio
import json
import logging
from datetime import datetime

import aio_pika
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from app.config import get_settings
from app.db.models import Job, JobStatus, Transcription
from app.services.audio.processor import AudioProcessor
from app.services.transcription.factory import TranscriptionFactory

settings = get_settings()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TranscriptionWorker:
    """RabbitMQ consumer for processing transcription jobs."""

    EXCHANGE_NAME = "voice_app.direct"
    QUEUES = {
        "transcription.queue": "transcription",
        "priority.queue": "priority",
    }

    def __init__(self):
        self.connection = None
        self.channel = None
        self.db_engine = None
        self.async_session = None

    async def setup_database(self):
        """Initialize database connection."""
        database_url = settings.database_url
        if database_url.startswith("postgresql://"):
            database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

        self.db_engine = create_async_engine(database_url)
        self.async_session = async_sessionmaker(
            self.db_engine,
            class_=AsyncSession,
            expire_on_commit=False
        )

    async def setup_rabbitmq(self):
        """Initialize RabbitMQ connection and queues."""
        self.connection = await aio_pika.connect_robust(settings.rabbitmq_url)
        self.channel = await self.connection.channel()

        # Set prefetch count for concurrency control
        await self.channel.set_qos(prefetch_count=settings.worker_concurrency)

        # Declare exchange
        exchange = await self.channel.declare_exchange(
            self.EXCHANGE_NAME,
            aio_pika.ExchangeType.DIRECT,
            durable=True
        )

        # Declare and bind queues
        for queue_name, routing_key in self.QUEUES.items():
            queue = await self.channel.declare_queue(
                queue_name,
                durable=True,
                arguments={
                    "x-max-priority": 10,
                    "x-dead-letter-exchange": "voice_app.dlx"
                }
            )
            await queue.bind(exchange, routing_key=routing_key)
            logger.info(f"Queue '{queue_name}' bound to routing key '{routing_key}'")

        # Declare dead letter exchange and queue
        dlx = await self.channel.declare_exchange(
            "voice_app.dlx",
            aio_pika.ExchangeType.DIRECT,
            durable=True
        )
        dlq = await self.channel.declare_queue("failed.queue", durable=True)
        await dlq.bind(dlx, routing_key="failed")

    async def process_job(self, message: aio_pika.IncomingMessage):
        """Process a single transcription job."""
        async with message.process():
            try:
                data = json.loads(message.body.decode())
                job_id = data["job_id"]
                logger.info(f"Processing job: {job_id}")

                async with self.async_session() as db:
                    # Get job from database
                    result = await db.execute(
                        select(Job).where(Job.id == job_id)
                    )
                    job = result.scalar_one_or_none()

                    if not job:
                        logger.error(f"Job not found: {job_id}")
                        return

                    if job.status == JobStatus.CANCELLED:
                        logger.info(f"Job cancelled, skipping: {job_id}")
                        return

                    # Update status to processing
                    job.status = JobStatus.PROCESSING
                    job.started_at = datetime.utcnow()
                    await db.commit()

                    try:
                        # Process audio
                        logger.info(f"Processing audio for job: {job_id}")
                        wav_path, samples = await AudioProcessor.process_for_transcription(
                            job.file_path
                        )

                        # Get audio info for duration
                        audio_info = await AudioProcessor.get_audio_info(wav_path)
                        job.duration_seconds = audio_info.get("duration")

                        # Transcribe
                        logger.info(f"Transcribing with {job.provider}: {job_id}")
                        provider = TranscriptionFactory.get_provider(job.provider or "whisper")
                        result = await provider.transcribe(
                            audio_path=wav_path,
                            model=job.model_name,
                            language=job.language
                        )

                        # Save transcription
                        transcription = Transcription(
                            job_id=job.id,
                            text=result.text,
                            language=result.language,
                            confidence=result.confidence,
                            word_count=result.word_count,
                            processing_time_ms=result.processing_time_ms,
                            provider=result.provider,
                            model_name=result.model,
                            segments=[s.__dict__ for s in result.segments] if result.segments else None
                        )
                        db.add(transcription)

                        # Update job status
                        job.status = JobStatus.COMPLETED
                        job.completed_at = datetime.utcnow()
                        job.progress = 100

                        await db.commit()
                        logger.info(f"Job completed: {job_id}")

                        # Send webhook if configured
                        if job.webhook_url:
                            await self.send_webhook(job, transcription)

                    except Exception as e:
                        logger.error(f"Job failed: {job_id} - {str(e)}")
                        job.status = JobStatus.FAILED
                        job.error_message = str(e)
                        job.completed_at = datetime.utcnow()
                        await db.commit()

            except Exception as e:
                logger.error(f"Error processing message: {str(e)}")
                raise

    async def send_webhook(self, job: Job, transcription: Transcription):
        """Send webhook notification for completed job."""
        import aiohttp

        payload = {
            "event_type": "transcription.completed",
            "job_id": str(job.id),
            "transcription_id": str(transcription.id),
            "status": "completed",
            "result": {
                "text": transcription.text,
                "language": transcription.language,
                "word_count": transcription.word_count,
                "confidence": transcription.confidence
            },
            "timestamp": datetime.utcnow().isoformat()
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    job.webhook_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    if response.status >= 400:
                        logger.warning(f"Webhook failed: {response.status}")
        except Exception as e:
            logger.warning(f"Webhook error: {str(e)}")

    async def run(self):
        """Start the worker."""
        logger.info("Starting transcription worker...")

        await self.setup_database()
        await self.setup_rabbitmq()

        # Consume from all queues
        for queue_name in self.QUEUES:
            queue = await self.channel.get_queue(queue_name)
            await queue.consume(self.process_job)
            logger.info(f"Consuming from queue: {queue_name}")

        logger.info("Worker started. Waiting for messages...")

        # Keep running
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            pass
        finally:
            await self.cleanup()

    async def cleanup(self):
        """Clean up resources."""
        if self.channel:
            await self.channel.close()
        if self.connection:
            await self.connection.close()
        if self.db_engine:
            await self.db_engine.dispose()
        logger.info("Worker shutdown complete")


async def main():
    """Entry point for worker."""
    worker = TranscriptionWorker()
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
