"""
Job Dispatcher - Polls database for pending jobs and publishes them to RabbitMQ.

This service ensures jobs in PENDING/QUEUED status are published to RabbitMQ,
implementing the industry-standard safety net for job processing systems.
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from app.config import get_settings
from app.db.models import Job, JobStatus
from app.services.job_service import JobService

settings = get_settings()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class JobDispatcher:
    """
    Background service that polls database for jobs that need to be queued.
    
    This implements a safety net for the job processing system:
    - Finds jobs in PENDING/QUEUED status
    - Publishes them to RabbitMQ
    - Handles jobs that were orphaned due to system failures
    """

    def __init__(self, poll_interval: int = 30):
        """
        Initialize the job dispatcher.
        
        Args:
            poll_interval: Seconds between database polls (default: 30)
        """
        self.poll_interval = poll_interval
        self.db_engine = None
        self.async_session = None
        self.job_service = None
        self._running = False

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

    async def setup_job_service(self):
        """Initialize job service for publishing to RabbitMQ."""
        self.job_service = JobService()
        await self.job_service._get_channel()  # Establish connection

    async def find_orphaned_jobs(self) -> list[Job]:
        """
        Find jobs that should be in the queue but aren't.
        
        Returns:
            List of jobs that need to be published to RabbitMQ
        """
        async with self.async_session() as db:
            # Find jobs in PENDING or QUEUED status
            # that were created more than 1 minute ago (likely stuck)
            cutoff_time = datetime.utcnow() - timedelta(minutes=1)
            
            result = await db.execute(
                select(Job)
                .where(
                    Job.status.in_([JobStatus.PENDING, JobStatus.QUEUED]),
                    Job.created_at < cutoff_time,
                    Job.started_at.is_(None)  # Not yet picked up by worker
                )
                .order_by(Job.priority.desc(), Job.created_at)
                .limit(100)  # Process in batches
            )
            jobs = result.scalars().all()
            return jobs

    async def publish_job(self, job: Job) -> bool:
        """
        Publish a single job to RabbitMQ.
        
        Args:
            job: Job to publish
            
        Returns:
            True if successfully published, False otherwise
        """
        try:
            await self.job_service.queue_job(job)
            logger.info(f"Dispatcher published job {job.id} to queue")
            
            # Update job status to QUEUED
            async with self.async_session() as db:
                job_db = await db.get(Job, job.id)
                if job_db and job_db.status in [JobStatus.PENDING]:
                    job_db.status = JobStatus.QUEUED
                    await db.commit()
            
            return True
        except Exception as e:
            logger.error(f"Dispatcher failed to publish job {job.id}: {str(e)}")
            return False

    async def dispatch_cycle(self):
        """Single dispatch cycle - find and publish orphaned jobs."""
        try:
            jobs = await self.find_orphaned_jobs()
            
            if jobs:
                logger.info(f"Dispatcher found {len(jobs)} orphaned jobs")
                
                published_count = 0
                failed_count = 0
                
                for job in jobs:
                    success = await self.publish_job(job)
                    if success:
                        published_count += 1
                    else:
                        failed_count += 1
                    
                    # Small delay between publishes to avoid overwhelming RabbitMQ
                    await asyncio.sleep(0.1)
                
                logger.info(
                    f"Dispatcher cycle complete: "
                    f"{published_count} published, {failed_count} failed"
                )
        except Exception as e:
            logger.error(f"Dispatcher cycle error: {str(e)}", exc_info=True)

    async def run(self):
        """Start the dispatcher service."""
        logger.info("Starting job dispatcher...")
        logger.info(f"Poll interval: {self.poll_interval} seconds")

        await self.setup_database()
        await self.setup_job_service()
        
        self._running = True
        logger.info("Job dispatcher started. Monitoring for orphaned jobs...")

        try:
            while self._running:
                await self.dispatch_cycle()
                await asyncio.sleep(self.poll_interval)
        except asyncio.CancelledError:
            pass
        finally:
            await self.cleanup()

    async def cleanup(self):
        """Clean up resources."""
        if self.job_service:
            await self.job_service.close()
        if self.db_engine:
            await self.db_engine.dispose()
        logger.info("Job dispatcher shutdown complete")

    async def stop(self):
        """Stop the dispatcher."""
        logger.info("Stopping job dispatcher...")
        self._running = False


async def main():
    """Entry point for dispatcher."""
    dispatcher = JobDispatcher(poll_interval=30)
    await dispatcher.run()


if __name__ == "__main__":
    asyncio.run(main())
