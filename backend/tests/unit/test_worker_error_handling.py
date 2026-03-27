"""
Unit tests for worker error handling
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Job, JobStatus, Transcription
from app.workers.consumer import TranscriptionWorker
import json


class TestWorkerErrorHandling:
    """Tests for worker error handling in various failure scenarios"""

    @pytest.mark.asyncio
    async def test_worker_handles_transcription_failure(
        self,
        db_session: AsyncSession,
        tmp_path
    ):
        """Test that worker properly sets job to FAILED on transcription error"""
        # Create test audio file
        test_file = tmp_path / "test_audio.wav"
        test_file.write_text("fake audio data")
        
        # Create job
        job = Job(
            job_type="transcription",
            status=JobStatus.PENDING,
            provider="whisper",
            model_name="tiny",
            original_filename="test_audio.wav",
            file_size_bytes=1000,
            file_path=str(test_file)
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)
        
        # Mock the transcription provider to raise an error
        with patch('app.services.transcription.factory.TranscriptionFactory.get_provider') as mock_factory:
            mock_provider = MagicMock()
            mock_provider.transcribe = AsyncMock(side_effect=Exception("Transcription failed"))
            mock_factory.return_value = mock_provider
            
            # Create worker and process job
            worker = TranscriptionWorker()
            worker.async_session = lambda: db_session
            
            # Create mock message
            message = MagicMock()
            message.body.decode.return_value = json.dumps({"job_id": str(job.id)})
            message.process.return_value.__aenter__ = AsyncMock(return_value=None)
            message.process.return_value.__aexit__ = AsyncMock(return_value=None)
            
            # Process the job
            try:
                await worker.process_job(message)
            except Exception:
                pass  # Worker should handle the error
            
            # Verify job is marked as FAILED with error message
            await db_session.refresh(job)
            assert job.status == JobStatus.FAILED
            assert job.error_message is not None
            assert "Transcription failed" in job.error_message
            assert job.completed_at is not None

    @pytest.mark.asyncio
    async def test_worker_handles_audio_processing_failure(
        self,
        db_session: AsyncSession,
        tmp_path
    ):
        """Test worker handles audio processing errors"""
        # Create job with invalid file
        job = Job(
            job_type="transcription",
            status=JobStatus.PENDING,
            provider="whisper",
            model_name="tiny",
            original_filename="nonexistent.wav",
            file_size_bytes=1000,
            file_path="/nonexistent/path/to/file.wav"
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)
        
        # Process job
        worker = TranscriptionWorker()
        worker.async_session = lambda: db_session
        
        message = MagicMock()
        message.body.decode.return_value = json.dumps({"job_id": str(job.id)})
        message.process.return_value.__aenter__ = AsyncMock(return_value=None)
        message.process.return_value.__aexit__ = AsyncMock(return_value=None)
        
        try:
            await worker.process_job(message)
        except Exception:
            pass
        
        # Verify job marked as failed
        await db_session.refresh(job)
        assert job.status == JobStatus.FAILED
        assert job.error_message is not None
        assert job.completed_at is not None

    @pytest.mark.asyncio
    async def test_worker_skips_cancelled_jobs(
        self,
        db_session: AsyncSession
    ):
        """Test that worker skips jobs that have been cancelled"""
        # Create cancelled job
        job = Job(
            job_type="transcription",
            status=JobStatus.CANCELLED,
            provider="whisper",
            model_name="tiny",
            original_filename="test.wav",
            file_size_bytes=1000,
            file_path="/tmp/test.wav"
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)
        
        # Process job
        worker = TranscriptionWorker()
        worker.async_session = lambda: db_session
        
        message = MagicMock()
        message.body.decode.return_value = json.dumps({"job_id": str(job.id)})
        message.process.return_value.__aenter__ = AsyncMock(return_value=None)
        message.process.return_value.__aexit__ = AsyncMock(return_value=None)
        
        await worker.process_job(message)
        
        # Verify job status unchanged
        await db_session.refresh(job)
        assert job.status == JobStatus.CANCELLED
        assert job.started_at is None  # Should not have been started

    @pytest.mark.asyncio
    async def test_worker_handles_nonexistent_job(
        self,
        db_session: AsyncSession
    ):
        """Test worker handles message for non-existent job gracefully"""
        fake_job_id = "00000000-0000-0000-0000-000000000000"
        
        worker = TranscriptionWorker()
        worker.async_session = lambda: db_session
        
        message = MagicMock()
        message.body.decode.return_value = json.dumps({"job_id": fake_job_id})
        message.process.return_value.__aenter__ = AsyncMock(return_value=None)
        message.process.return_value.__aexit__ = AsyncMock(return_value=None)
        
        # Should not raise exception
        await worker.process_job(message)

    @pytest.mark.asyncio
    async def test_worker_updates_job_to_processing(
        self,
        db_session: AsyncSession,
        tmp_path
    ):
        """Test that worker updates job status to PROCESSING when it starts"""
        test_file = tmp_path / "test_audio.wav"
        test_file.write_text("fake audio data")
        
        job = Job(
            job_type="transcription",
            status=JobStatus.PENDING,
            provider="whisper",
            model_name="tiny",
            original_filename="test_audio.wav",
            file_size_bytes=1000,
            file_path=str(test_file)
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)
        
        # Mock dependencies to fail after status update
        with patch('app.services.audio.processor.AudioProcessor.process_for_transcription') as mock_process:
            mock_process.side_effect = Exception("Simulated failure")
            
            worker = TranscriptionWorker()
            worker.async_session = lambda: db_session
            
            message = MagicMock()
            message.body.decode.return_value = json.dumps({"job_id": str(job.id)})
            message.process.return_value.__aenter__ = AsyncMock(return_value=None)
            message.process.return_value.__aexit__ = AsyncMock(return_value=None)
            
            try:
                await worker.process_job(message)
            except Exception:
                pass
            
            # Even though it failed, it should have set started_at
            await db_session.refresh(job)
            assert job.status == JobStatus.FAILED
            assert job.started_at is not None

    @pytest.mark.asyncio
    async def test_worker_successful_transcription_flow(
        self,
        db_session: AsyncSession,
        tmp_path
    ):
        """Test complete successful transcription flow"""
        test_file = tmp_path / "test_audio.wav"
        test_file.write_text("fake audio data")
        
        job = Job(
            job_type="transcription",
            status=JobStatus.PENDING,
            provider="whisper",
            model_name="tiny",
            original_filename="test_audio.wav",
            file_size_bytes=1000,
            file_path=str(test_file)
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)
        
        # Mock successful processing
        with patch('app.services.audio.processor.AudioProcessor.process_for_transcription') as mock_process, \
             patch('app.services.audio.processor.AudioProcessor.get_audio_info') as mock_info, \
             patch('app.services.transcription.factory.TranscriptionFactory.get_provider') as mock_factory:
            
            mock_process.return_value = (str(test_file), None)
            mock_info.return_value = {"duration": 10.5}
            
            # Mock transcription result
            from app.services.transcription.base import TranscriptionResult
            mock_result = TranscriptionResult(
                text="Test transcription text",
                language="en",
                processing_time_ms=1000,
                provider="whisper",
                model="tiny"
            )
            
            mock_provider = MagicMock()
            mock_provider.transcribe = AsyncMock(return_value=mock_result)
            mock_factory.return_value = mock_provider
            
            worker = TranscriptionWorker()
            worker.async_session = lambda: db_session
            
            message = MagicMock()
            message.body.decode.return_value = json.dumps({"job_id": str(job.id)})
            message.process.return_value.__aenter__ = AsyncMock(return_value=None)
            message.process.return_value.__aexit__ = AsyncMock(return_value=None)
            
            await worker.process_job(message)
            
            # Verify job completed successfully
            await db_session.refresh(job)
            assert job.status == JobStatus.COMPLETED
            assert job.completed_at is not None
            assert job.progress == 100
            assert job.duration_seconds == 10.5
            assert job.error_message is None
            
            # Verify transcription was created
            from sqlalchemy import select
            result = await db_session.execute(
                select(Transcription).where(Transcription.job_id == job.id)
            )
            transcription = result.scalar_one_or_none()
            assert transcription is not None
            assert transcription.text == "Test transcription text"
            assert transcription.language == "en"
