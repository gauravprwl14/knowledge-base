"""Job monitoring service to detect and handle stale jobs."""
import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from app.config import get_settings
from app.db.models import Job, JobStatus

settings = get_settings()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class JobMonitor:
    """Monitor jobs and handle stale/stuck jobs."""

    def __init__(self):
        self.db_engine = None
        self.async_session = None
        self.running = False

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

    async def check_stale_jobs(self):
        """Check for jobs stuck in processing state and mark them as failed."""
        if not self.async_session:
            logger.error("Database session not initialized")
            return

        try:
            async with self.async_session() as db:
                # Calculate the cutoff time for stale jobs
                cutoff_time = datetime.utcnow() - timedelta(minutes=settings.job_timeout_minutes)

                # Find jobs that have been processing for too long
                result = await db.execute(
                    select(Job).where(
                        Job.status == JobStatus.PROCESSING,
                        Job.started_at < cutoff_time
                    )
                )
                stale_jobs = result.scalars().all()

                if stale_jobs:
                    logger.info(f"Found {len(stale_jobs)} stale jobs")

                    for job in stale_jobs:
                        logger.warning(
                            f"Marking stale job as failed: {job.id} "
                            f"(started at {job.started_at}, timeout: {settings.job_timeout_minutes} minutes)"
                        )
                        job.status = JobStatus.FAILED
                        job.error_message = (
                            f"Job timed out after {settings.job_timeout_minutes} minutes. "
                            "Worker may have crashed or been restarted."
                        )
                        job.completed_at = datetime.utcnow()

                    await db.commit()
                    logger.info(f"Successfully marked {len(stale_jobs)} stale jobs as failed")
                else:
                    logger.debug("No stale jobs found")

        except Exception as e:
            logger.error(f"Error checking stale jobs: {e}", exc_info=True)

    async def run(self):
        """Start the monitoring loop."""
        if not settings.enable_job_scheduler:
            logger.info("Job scheduler is disabled in configuration")
            return

        logger.info("Starting job monitor...")
        logger.info(
            f"Configuration: timeout={settings.job_timeout_minutes}m, "
            f"check_interval={settings.scheduler_check_interval_seconds}s"
        )

        await self.setup_database()
        self.running = True

        try:
            while self.running:
                try:
                    await self.check_stale_jobs()
                except Exception as e:
                    logger.error(f"Error in monitoring loop: {e}", exc_info=True)

                # Wait for the next check
                await asyncio.sleep(settings.scheduler_check_interval_seconds)

        except asyncio.CancelledError:
            logger.info("Job monitor cancelled")
        finally:
            await self.cleanup()

    async def stop(self):
        """Stop the monitoring loop."""
        logger.info("Stopping job monitor...")
        self.running = False

    async def cleanup(self):
        """Clean up resources."""
        if self.db_engine:
            await self.db_engine.dispose()
        logger.info("Job monitor cleanup complete")


async def main():
    """Entry point for running the monitor as a standalone service."""
    monitor = JobMonitor()
    try:
        await monitor.run()
    except KeyboardInterrupt:
        await monitor.stop()


if __name__ == "__main__":
    asyncio.run(main())
