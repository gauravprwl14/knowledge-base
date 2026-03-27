import asyncio
import json
import logging
from concurrent.futures import ThreadPoolExecutor
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
        # Create a dedicated thread pool with limited workers for CPU-intensive tasks
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="whisper-")

    async def setup_database(self):
        """Initialize database connection and reset stale jobs."""
        database_url = settings.database_url
        if database_url.startswith("postgresql://"):
            database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

        self.db_engine = create_async_engine(database_url)
        self.async_session = async_sessionmaker(
            self.db_engine,
            class_=AsyncSession,
            expire_on_commit=False
        )
        
        # Reset any jobs stuck in PROCESSING status (from crashed workers)
        await self.reset_stale_jobs()
    
    async def reset_stale_jobs(self):
        """Reset jobs that were left in PROCESSING status from crashed workers."""
        try:
            async with self.async_session() as db:
                from sqlalchemy import update
                result = await db.execute(
                    update(Job)
                    .where(Job.status == JobStatus.PROCESSING)
                    .values(status=JobStatus.QUEUED, started_at=None)
                    .returning(Job.id)
                )
                reset_jobs = result.scalars().all()
                await db.commit()
                
                if reset_jobs:
                    logger.info(f"Reset {len(reset_jobs)} stale jobs from PROCESSING to QUEUED")
                    for job_id in reset_jobs:
                        logger.info(f"  - Reset job: {job_id}")
        except Exception as e:
            logger.error(f"Error resetting stale jobs: {e}", exc_info=True)

    async def setup_rabbitmq(self):
        """Initialize RabbitMQ connection and queues."""
        # Configure connection with longer consumer timeout for large models
        self.connection = await aio_pika.connect_robust(
            settings.rabbitmq_url,
            timeout=3600,  # 1 hour timeout for connection
        )
        self.channel = await self.connection.channel()

        # Set prefetch count to 1 for large models to prevent overload
        # Worker will only take 1 job at a time per consumer
        await self.channel.set_qos(prefetch_count=1)

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
        async with message.process(ignore_processed=True):
            try:
                data = json.loads(message.body.decode())
                job_id = data["job_id"]
                logger.info(f"Processing job: {job_id}")

                async with self.async_session() as db:
                    try:
                        # Get job from database
                        result = await db.execute(
                            select(Job).where(Job.id == job_id)
                        )
                        job = result.scalar_one_or_none()

                        if not job:
                            logger.error(f"Job not found: {job_id}")
                            return  # Message will be acked automatically

                        if job.status == JobStatus.CANCELLED:
                            logger.info(f"Job cancelled, skipping: {job_id}")
                            return  # Message will be acked automatically

                        # Skip if already completed or failed
                        if job.status in (JobStatus.COMPLETED, JobStatus.FAILED):
                            logger.info(f"Job already {job.status}, skipping: {job_id}")
                            return  # Message will be acked automatically
                        
                        # Accept jobs in PENDING, QUEUED, or PROCESSING status
                        if job.status not in (JobStatus.PENDING, JobStatus.QUEUED, JobStatus.PROCESSING):
                            logger.warning(f"Job has unexpected status {job.status}, skipping: {job_id}")
                            return  # Message will be acked automatically

                        # Update status to processing
                        job.status = JobStatus.PROCESSING
                        job.started_at = datetime.utcnow()
                        await db.commit()

                        # Process audio
                        logger.info(f"Processing audio for job: {job_id}")
                        wav_path, samples = await AudioProcessor.process_for_transcription(
                            job.file_path
                        )

                        # Get audio info for duration
                        audio_info = await AudioProcessor.get_audio_info(wav_path)
                        job.duration_seconds = audio_info.get("duration")

                        # Transcribe with timeout protection (job_timeout_minutes from config)
                        logger.info(f"Transcribing with {job.provider}: {job_id}")
                        provider = TranscriptionFactory.get_provider(job.provider or "whisper")
                        
                        timeout_seconds = settings.job_timeout_minutes * 60
                        try:
                            result = await asyncio.wait_for(
                                provider.transcribe(
                                    audio_path=wav_path,
                                    model=job.model_name,
                                    language=job.language,
                                    executor=self.executor  # Pass dedicated executor
                                ),
                                timeout=timeout_seconds
                            )
                        except asyncio.TimeoutError:
                            raise TimeoutError(
                                f"Transcription timeout after {settings.job_timeout_minutes} minutes. "
                                f"Try using a smaller model or shorter audio file."
                            )
                        except ValueError as e:
                            # Model loading or validation errors - don't retry
                            logger.error(f"Model error for job {job_id}: {str(e)}")
                            raise

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
                        logger.error(f"Job processing error: {job_id} - {str(e)}", exc_info=True)
                        await db.rollback()
                        
                        # Try to update job status to failed
                        try:
                            job.status = JobStatus.FAILED
                            job.error_message = str(e)
                            job.completed_at = datetime.utcnow()
                            await db.commit()
                        except Exception as db_error:
                            logger.error(f"Failed to update job status: {db_error}")
                        
                        # Re-raise to let message.process() handle rejection
                        raise

            except Exception as e:
                logger.error(f"Critical error processing message: {str(e)}", exc_info=True)
                # Re-raise to let message.process() handle rejection
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

        # Create tasks for consuming from all queues concurrently
        consume_tasks = []
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
        if self.executor:
            logger.info("Shutting down executor...")
            self.executor.shutdown(wait=True, cancel_futures=True)
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
