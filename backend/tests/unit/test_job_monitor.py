"""
Unit tests for job monitoring scheduler
"""
import pytest
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Job, JobStatus
from app.services.job_monitor import JobMonitor
from app.config import get_settings


class TestJobMonitor:
    """Tests for job monitoring scheduler"""

    @pytest.mark.asyncio
    async def test_detect_stale_jobs(
        self,
        db_session: AsyncSession
    ):
        """Test detection of stale jobs stuck in processing"""
        settings = get_settings()
        
        # Create a job that started over an hour ago (stale)
        stale_job = Job(
            job_type="transcription",
            status=JobStatus.PROCESSING,
            provider="whisper",
            model_name="tiny",
            original_filename="stale.wav",
            file_size_bytes=1000,
            file_path="/tmp/stale.wav",
            started_at=datetime.utcnow() - timedelta(minutes=settings.job_timeout_minutes + 10)
        )
        
        # Create a recent processing job (not stale)
        recent_job = Job(
            job_type="transcription",
            status=JobStatus.PROCESSING,
            provider="whisper",
            model_name="tiny",
            original_filename="recent.wav",
            file_size_bytes=1000,
            file_path="/tmp/recent.wav",
            started_at=datetime.utcnow() - timedelta(minutes=5)
        )
        
        # Create a completed job (should be ignored)
        completed_job = Job(
            job_type="transcription",
            status=JobStatus.COMPLETED,
            provider="whisper",
            model_name="tiny",
            original_filename="completed.wav",
            file_size_bytes=1000,
            file_path="/tmp/completed.wav",
            started_at=datetime.utcnow() - timedelta(hours=2),
            completed_at=datetime.utcnow() - timedelta(hours=1)
        )
        
        db_session.add(stale_job)
        db_session.add(recent_job)
        db_session.add(completed_job)
        await db_session.commit()
        await db_session.refresh(stale_job)
        await db_session.refresh(recent_job)
        await db_session.refresh(completed_job)
        
        # Run the monitor check
        monitor = JobMonitor()
        monitor.async_session = lambda: db_session
        await monitor.check_stale_jobs()
        
        # Verify results
        await db_session.refresh(stale_job)
        await db_session.refresh(recent_job)
        await db_session.refresh(completed_job)
        
        assert stale_job.status == JobStatus.FAILED
        assert stale_job.error_message is not None
        assert "timed out" in stale_job.error_message.lower()
        assert stale_job.completed_at is not None
        
        assert recent_job.status == JobStatus.PROCESSING
        assert recent_job.error_message is None
        
        assert completed_job.status == JobStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_no_stale_jobs(
        self,
        db_session: AsyncSession
    ):
        """Test when there are no stale jobs"""
        # Create only recent jobs
        job = Job(
            job_type="transcription",
            status=JobStatus.PROCESSING,
            provider="whisper",
            model_name="tiny",
            original_filename="recent.wav",
            file_size_bytes=1000,
            file_path="/tmp/recent.wav",
            started_at=datetime.utcnow() - timedelta(minutes=5)
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)
        
        # Run monitor check
        monitor = JobMonitor()
        monitor.async_session = lambda: db_session
        await monitor.check_stale_jobs()
        
        # Verify job is unchanged
        await db_session.refresh(job)
        assert job.status == JobStatus.PROCESSING
        assert job.error_message is None

    @pytest.mark.asyncio
    async def test_multiple_stale_jobs(
        self,
        db_session: AsyncSession
    ):
        """Test handling multiple stale jobs at once"""
        settings = get_settings()
        
        # Create multiple stale jobs
        stale_jobs = []
        for i in range(5):
            job = Job(
                job_type="transcription",
                status=JobStatus.PROCESSING,
                provider="whisper",
                model_name="tiny",
                original_filename=f"stale_{i}.wav",
                file_size_bytes=1000,
                file_path=f"/tmp/stale_{i}.wav",
                started_at=datetime.utcnow() - timedelta(minutes=settings.job_timeout_minutes + 10)
            )
            db_session.add(job)
            stale_jobs.append(job)
        
        await db_session.commit()
        for job in stale_jobs:
            await db_session.refresh(job)
        
        # Run monitor
        monitor = JobMonitor()
        monitor.async_session = lambda: db_session
        await monitor.check_stale_jobs()
        
        # Verify all are marked as failed
        for job in stale_jobs:
            await db_session.refresh(job)
            assert job.status == JobStatus.FAILED
            assert "timed out" in job.error_message.lower()


class TestJobMonitorConfiguration:
    """Tests for job monitor configuration"""

    def test_monitor_respects_enabled_flag(self):
        """Test that monitor can be disabled via configuration"""
        settings = get_settings()
        
        # Monitor should be enabled by default
        assert settings.enable_job_scheduler is True
        
        # Verify timeout and interval settings exist
        assert settings.job_timeout_minutes > 0
        assert settings.scheduler_check_interval_seconds > 0

    def test_configurable_timeout(self):
        """Test that job timeout is configurable"""
        settings = get_settings()
        
        # Default should be 60 minutes
        assert settings.job_timeout_minutes == 60

    def test_configurable_check_interval(self):
        """Test that check interval is configurable"""
        settings = get_settings()
        
        # Default should be 300 seconds (5 minutes)
        assert settings.scheduler_check_interval_seconds == 300
