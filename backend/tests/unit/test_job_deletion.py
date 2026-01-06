"""
Unit tests for job deletion endpoint
"""
import os
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Job, JobStatus, Transcription


class TestJobDeletion:
    """Tests for job deletion endpoint"""

    @pytest.mark.asyncio
    async def test_delete_job_success(
        self,
        authenticated_client: AsyncClient,
        db_session: AsyncSession,
        tmp_path
    ):
        """Test successful job deletion"""
        # Create a test file
        test_file = tmp_path / "test_audio.wav"
        test_file.write_text("fake audio data")
        
        # Create test job
        job = Job(
            job_type="transcription",
            status=JobStatus.COMPLETED,
            provider="whisper",
            model_name="tiny",
            original_filename="test_audio.wav",
            file_size_bytes=1000,
            file_path=str(test_file)
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)
        
        # Delete the job
        response = await authenticated_client.delete(f"/api/v1/jobs/{job.id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Job deleted successfully"
        assert data["job_id"] == str(job.id)
        
        # Verify job is deleted from database
        from sqlalchemy import select
        result = await db_session.execute(select(Job).where(Job.id == job.id))
        deleted_job = result.scalar_one_or_none()
        assert deleted_job is None

    @pytest.mark.asyncio
    async def test_delete_processing_job_cancels_first(
        self,
        authenticated_client: AsyncClient,
        db_session: AsyncSession,
        tmp_path
    ):
        """Test that processing jobs are cancelled before deletion"""
        test_file = tmp_path / "test_audio.wav"
        test_file.write_text("fake audio data")
        
        # Create processing job
        job = Job(
            job_type="transcription",
            status=JobStatus.PROCESSING,
            provider="whisper",
            model_name="tiny",
            original_filename="test_audio.wav",
            file_size_bytes=1000,
            file_path=str(test_file)
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)
        
        response = await authenticated_client.delete(f"/api/v1/jobs/{job.id}")
        
        assert response.status_code == 200
        data = response.json()
        assert "Job deleted successfully" in data["message"]

    @pytest.mark.asyncio
    async def test_delete_job_with_transcription(
        self,
        authenticated_client: AsyncClient,
        db_session: AsyncSession,
        tmp_path
    ):
        """Test that transcription is cascade deleted with job"""
        test_file = tmp_path / "test_audio.wav"
        test_file.write_text("fake audio data")
        
        # Create job with transcription
        job = Job(
            job_type="transcription",
            status=JobStatus.COMPLETED,
            provider="whisper",
            model_name="tiny",
            original_filename="test_audio.wav",
            file_size_bytes=1000,
            file_path=str(test_file)
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)
        
        transcription = Transcription(
            job_id=job.id,
            text="Test transcription",
            language="en",
            confidence=0.95,
            word_count=2,
            processing_time_ms=1000,
            provider="whisper",
            model_name="tiny"
        )
        db_session.add(transcription)
        await db_session.commit()
        
        # Delete job
        response = await authenticated_client.delete(f"/api/v1/jobs/{job.id}")
        assert response.status_code == 200
        
        # Verify transcription is also deleted
        from sqlalchemy import select
        result = await db_session.execute(
            select(Transcription).where(Transcription.job_id == job.id)
        )
        deleted_transcription = result.scalar_one_or_none()
        assert deleted_transcription is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_job(
        self,
        authenticated_client: AsyncClient
    ):
        """Test deleting a job that doesn't exist"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = await authenticated_client.delete(f"/api/v1/jobs/{fake_id}")
        
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_delete_job_unauthorized(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tmp_path
    ):
        """Test deleting a job without authentication"""
        test_file = tmp_path / "test_audio.wav"
        test_file.write_text("fake audio data")
        
        job = Job(
            job_type="transcription",
            status=JobStatus.COMPLETED,
            provider="whisper",
            model_name="tiny",
            original_filename="test_audio.wav",
            file_size_bytes=1000,
            file_path=str(test_file)
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)
        
        # Try to delete without API key
        response = await client.delete(f"/api/v1/jobs/{job.id}")
        assert response.status_code == 403


class TestJobCancellation:
    """Tests for job cancellation endpoint"""

    @pytest.mark.asyncio
    async def test_cancel_pending_job(
        self,
        authenticated_client: AsyncClient,
        db_session: AsyncSession
    ):
        """Test cancelling a pending job"""
        job = Job(
            job_type="transcription",
            status=JobStatus.PENDING,
            provider="whisper",
            model_name="tiny",
            original_filename="test.wav",
            file_size_bytes=1000,
            file_path="/tmp/test.wav"
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)
        
        response = await authenticated_client.post(f"/api/v1/jobs/{job.id}/cancel")
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Job cancelled"
        
        # Verify job status changed
        await db_session.refresh(job)
        assert job.status == JobStatus.CANCELLED

    @pytest.mark.asyncio
    async def test_cancel_processing_job(
        self,
        authenticated_client: AsyncClient,
        db_session: AsyncSession
    ):
        """Test cancelling a processing job"""
        job = Job(
            job_type="transcription",
            status=JobStatus.PROCESSING,
            provider="whisper",
            model_name="tiny",
            original_filename="test.wav",
            file_size_bytes=1000,
            file_path="/tmp/test.wav"
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)
        
        response = await authenticated_client.post(f"/api/v1/jobs/{job.id}/cancel")
        
        assert response.status_code == 200
        await db_session.refresh(job)
        assert job.status == JobStatus.CANCELLED

    @pytest.mark.asyncio
    async def test_cannot_cancel_completed_job(
        self,
        authenticated_client: AsyncClient,
        db_session: AsyncSession
    ):
        """Test that completed jobs cannot be cancelled"""
        job = Job(
            job_type="transcription",
            status=JobStatus.COMPLETED,
            provider="whisper",
            model_name="tiny",
            original_filename="test.wav",
            file_size_bytes=1000,
            file_path="/tmp/test.wav"
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)
        
        response = await authenticated_client.post(f"/api/v1/jobs/{job.id}/cancel")
        
        assert response.status_code == 400
        assert "Cannot cancel" in response.json()["detail"]
