"""
Unit tests for job management service
"""

import pytest
import os
from uuid import uuid4
from unittest.mock import Mock, patch, AsyncMock
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.job_management import JobManagementService
from app.db.models import Job, JobStatus, JobType
from app.utils.errors import AppException, JobErrors
from app.config import get_settings


@pytest.fixture
def mock_job():
    """Create a mock job"""
    job = Mock(spec=Job)
    job.id = uuid4()
    job.api_key_id = uuid4()
    job.status = JobStatus.COMPLETED
    job.file_path = "/tmp/test_audio.mp3"
    job.original_filename = "test_audio.mp3"
    job.job_type = JobType.TRANSCRIPTION
    return job


@pytest.fixture
def mock_db_session():
    """Create a mock database session"""
    session = AsyncMock(spec=AsyncSession)
    return session


class TestDeleteJobFiles:
    """Tests for delete_job_files method"""

    @pytest.mark.asyncio
    async def test_delete_files_success(self, mock_job):
        """Test successful file deletion"""
        # Create test files
        os.makedirs("/tmp/test_uploads", exist_ok=True)
        os.makedirs("/tmp/test_processed", exist_ok=True)
        
        upload_file = "/tmp/test_uploads/test.mp3"
        processed_file = "/tmp/test_processed/test.wav"
        
        with open(upload_file, 'w') as f:
            f.write("test")
        with open(processed_file, 'w') as f:
            f.write("test")
        
        mock_job.file_path = upload_file
        
        with patch('app.services.job_management.settings') as mock_settings:
            mock_settings.temp_upload_dir = "/tmp/test_uploads"
            mock_settings.temp_processed_dir = "/tmp/test_processed"
            
            result = await JobManagementService.delete_job_files(mock_job)
        
        assert len(result["files_deleted"]) == 2
        assert len(result["files_failed"]) == 0
        assert not os.path.exists(upload_file)
        assert not os.path.exists(processed_file)
        
        # Cleanup
        os.rmdir("/tmp/test_uploads")
        os.rmdir("/tmp/test_processed")

    @pytest.mark.asyncio
    async def test_delete_files_not_exist(self, mock_job):
        """Test deletion when files don't exist"""
        mock_job.file_path = "/nonexistent/file.mp3"
        
        result = await JobManagementService.delete_job_files(mock_job)
        
        assert len(result["files_deleted"]) == 0
        assert len(result["files_failed"]) == 0

    @pytest.mark.asyncio
    async def test_delete_files_permission_error(self, mock_job):
        """Test deletion with permission error"""
        upload_file = "/tmp/readonly_test.mp3"
        
        with open(upload_file, 'w') as f:
            f.write("test")
        
        os.chmod(upload_file, 0o000)
        mock_job.file_path = upload_file
        
        result = await JobManagementService.delete_job_files(mock_job)
        
        assert len(result["files_deleted"]) == 0
        assert len(result["files_failed"]) == 1
        
        # Cleanup
        os.chmod(upload_file, 0o644)
        os.remove(upload_file)


class TestDeleteSingleJob:
    """Tests for delete_single_job method"""

    @pytest.mark.asyncio
    async def test_delete_job_not_found(self, mock_db_session):
        """Test deleting non-existent job"""
        job_id = uuid4()
        api_key_id = uuid4()
        
        # Mock database query returning None
        mock_result = Mock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result
        
        with pytest.raises(AppException) as exc_info:
            await JobManagementService.delete_single_job(
                db=mock_db_session,
                job_id=job_id,
                api_key_id=api_key_id
            )
        
        assert exc_info.value.error_def == JobErrors.JOB1001

    @pytest.mark.asyncio
    async def test_delete_processing_job(self, mock_db_session, mock_job):
        """Test deleting a processing job cancels it first"""
        mock_job.status = JobStatus.PROCESSING
        
        mock_result = Mock()
        mock_result.scalar_one_or_none.return_value = mock_job
        mock_db_session.execute.return_value = mock_result
        
        with patch.object(
            JobManagementService, 
            'delete_job_files',
            return_value={"files_deleted": [], "files_failed": []}
        ):
            result = await JobManagementService.delete_single_job(
                db=mock_db_session,
                job_id=mock_job.id,
                api_key_id=mock_job.api_key_id
            )
        
        assert mock_job.status == JobStatus.CANCELLED
        assert result["job_id"] == str(mock_job.id)
        assert result["status"] == "deleted"

    @pytest.mark.asyncio
    async def test_delete_completed_job(self, mock_db_session, mock_job):
        """Test deleting a completed job"""
        mock_result = Mock()
        mock_result.scalar_one_or_none.return_value = mock_job
        mock_db_session.execute.return_value = mock_result
        
        with patch.object(
            JobManagementService,
            'delete_job_files',
            return_value={"files_deleted": ["/tmp/test.mp3"], "files_failed": []}
        ):
            result = await JobManagementService.delete_single_job(
                db=mock_db_session,
                job_id=mock_job.id,
                api_key_id=mock_job.api_key_id
            )
        
        assert result["job_id"] == str(mock_job.id)
        assert result["status"] == "deleted"
        assert len(result["files_deleted"]) == 1
        mock_db_session.delete.assert_called_once_with(mock_job)
        mock_db_session.commit.assert_called_once()


class TestBulkDeleteJobs:
    """Tests for bulk_delete_jobs method"""

    @pytest.mark.asyncio
    async def test_bulk_delete_no_jobs(self, mock_db_session):
        """Test bulk delete with empty job list"""
        with pytest.raises(AppException) as exc_info:
            await JobManagementService.bulk_delete_jobs(
                db=mock_db_session,
                job_ids=[],
                api_key_id=uuid4()
            )
        
        assert exc_info.value.error_def == JobErrors.JOB1007

    @pytest.mark.asyncio
    async def test_bulk_delete_limit_exceeded(self, mock_db_session):
        """Test bulk delete exceeds limit"""
        job_ids = [uuid4() for _ in range(101)]
        
        with pytest.raises(AppException) as exc_info:
            await JobManagementService.bulk_delete_jobs(
                db=mock_db_session,
                job_ids=job_ids,
                api_key_id=uuid4()
            )
        
        assert exc_info.value.error_def == JobErrors.JOB1008

    @pytest.mark.asyncio
    async def test_bulk_delete_success(self, mock_db_session):
        """Test successful bulk delete"""
        job_ids = [uuid4() for _ in range(3)]
        api_key_id = uuid4()
        
        # Create mock jobs
        jobs = []
        for job_id in job_ids:
            job = Mock(spec=Job)
            job.id = job_id
            job.api_key_id = api_key_id
            job.status = JobStatus.COMPLETED
            job.original_filename = f"test_{job_id}.mp3"
            jobs.append(job)
        
        mock_result = Mock()
        mock_result.scalars.return_value.all.return_value = jobs
        mock_db_session.execute.return_value = mock_result
        
        with patch.object(
            JobManagementService,
            'delete_job_files',
            return_value={"files_deleted": [], "files_failed": []}
        ):
            result = await JobManagementService.bulk_delete_jobs(
                db=mock_db_session,
                job_ids=job_ids,
                api_key_id=api_key_id
            )
        
        assert result["deleted_count"] == 3
        assert result["failed_count"] == 0
        assert result["total_requested"] == 3
        assert len(result["deleted_jobs"]) == 3

    @pytest.mark.asyncio
    async def test_bulk_delete_partial_failure(self, mock_db_session):
        """Test bulk delete with partial failures"""
        job_ids = [uuid4() for _ in range(3)]
        api_key_id = uuid4()
        
        # Create mock jobs
        jobs = []
        for i, job_id in enumerate(job_ids[:2]):  # Only 2 jobs found
            job = Mock(spec=Job)
            job.id = job_id
            job.api_key_id = api_key_id
            job.status = JobStatus.COMPLETED
            job.original_filename = f"test_{i}.mp3"
            jobs.append(job)
        
        # Simulate one job failing during deletion
        def mock_delete_files(job):
            if job == jobs[1]:
                raise Exception("Disk full")
            return {"files_deleted": [], "files_failed": []}
        
        mock_result = Mock()
        mock_result.scalars.return_value.all.return_value = jobs
        mock_db_session.execute.return_value = mock_result
        
        with patch.object(
            JobManagementService,
            'delete_job_files',
            side_effect=mock_delete_files
        ):
            result = await JobManagementService.bulk_delete_jobs(
                db=mock_db_session,
                job_ids=job_ids,
                api_key_id=api_key_id
            )
        
        assert result["deleted_count"] == 1
        assert result["failed_count"] == 1
        assert result["total_requested"] == 3

    @pytest.mark.asyncio
    async def test_bulk_delete_no_matching_jobs(self, mock_db_session):
        """Test bulk delete when no jobs match"""
        job_ids = [uuid4() for _ in range(3)]
        
        mock_result = Mock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db_session.execute.return_value = mock_result
        
        with pytest.raises(AppException) as exc_info:
            await JobManagementService.bulk_delete_jobs(
                db=mock_db_session,
                job_ids=job_ids,
                api_key_id=uuid4()
            )
        
        assert exc_info.value.error_def == JobErrors.JOB1001
        assert "No matching jobs found" in exc_info.value.detail
