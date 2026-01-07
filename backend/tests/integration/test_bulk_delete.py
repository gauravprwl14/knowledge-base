"""
Integration tests for bulk delete functionality
"""

import pytest
from httpx import AsyncClient
from uuid import uuid4
import os
from pathlib import Path

from app.main import app
from app.db.models import Job, JobStatus, JobType
from sqlalchemy import select


@pytest.mark.asyncio
async def test_bulk_delete_integration(authenticated_client, db_session):
    """Integration test for bulk delete operation"""
    
    # Create test jobs
    job_ids = []
    
    for i in range(3):
        job = Job(
            id=uuid4(),
            status=JobStatus.COMPLETED,
            job_type=JobType.TRANSCRIPTION,
            provider="whisper",
            model_name="base",
            file_path=f"/tmp/test_{i}.mp3",
            original_filename=f"test_{i}.mp3",
            progress=100
        )
        db_session.add(job)
        job_ids.append(str(job.id))
    
    await db_session.commit()
    
    # Test bulk delete
    response = await authenticated_client.post(
        "/api/v1/jobs/bulk/delete",
        json={"job_ids": job_ids}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["deleted_count"] == 3
    assert data["failed_count"] == 0
    assert data["total_requested"] == 3
    assert len(data["deleted_jobs"]) == 3


@pytest.mark.asyncio
async def test_bulk_delete_partial_success(authenticated_client, db_session):
    """Test bulk delete with some jobs not found"""
    
    # Create 2 valid jobs
    valid_job_ids = []
    
    for i in range(2):
        job = Job(
            id=uuid4(),
            status=JobStatus.COMPLETED,
            job_type=JobType.TRANSCRIPTION,
            provider="whisper",
            model_name="base",
            file_path=f"/tmp/test_{i}.mp3",
            original_filename=f"test_{i}.mp3",
            progress=100
        )
        db_session.add(job)
        valid_job_ids.append(str(job.id))
    
    await db_session.commit()
    
    # Add an invalid job ID
    invalid_job_id = str(uuid4())
    all_job_ids = valid_job_ids + [invalid_job_id]
    
    response = await authenticated_client.post(
        "/api/v1/jobs/bulk/delete",
        json={"job_ids": all_job_ids}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["deleted_count"] == 2
    assert data["failed_count"] == 1
    assert data["total_requested"] == 3
    
    # Verify failed job has standard error format
    assert len(data["failed_jobs"]) == 1
    failed_job = data["failed_jobs"][0]
    assert "errorCode" in failed_job
    assert "message" in failed_job
    assert "type" in failed_job
    assert "category" in failed_job
    assert "data" in failed_job
    assert failed_job["errorCode"] == "JOB1001"
    assert failed_job["type"] == "not_found"
    assert failed_job["category"] == "resource"
    assert failed_job["data"]["job_id"] == invalid_job_id


@pytest.mark.asyncio
async def test_bulk_delete_empty_list(authenticated_client):
    """Test bulk delete with empty job list"""
    
    response = await authenticated_client.post(
        "/api/v1/jobs/bulk/delete",
        json={"job_ids": []}
    )
    
    assert response.status_code == 400
    data = response.json()
    assert "errors" in data
    assert any("JOB1007" in error["errorCode"] for error in data["errors"])


@pytest.mark.asyncio
async def test_bulk_delete_limit_exceeded(authenticated_client):
    """Test bulk delete with more than 100 jobs"""
    
    # Create 101 job IDs
    job_ids = [str(uuid4()) for _ in range(101)]
    
    response = await authenticated_client.post(
        "/api/v1/jobs/bulk/delete",
        json={"job_ids": job_ids}
    )
    
    assert response.status_code == 400
    data = response.json()
    assert "errors" in data
    assert any("JOB1008" in error["errorCode"] for error in data["errors"])


@pytest.mark.asyncio
async def test_bulk_delete_unauthorized(client):
    """Test bulk delete without authentication"""
    
    job_ids = [str(uuid4()) for _ in range(3)]
    
    response = await client.post(
        "/api/v1/jobs/bulk/delete",
        json={"job_ids": job_ids}
    )
    
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_bulk_delete_with_file_cleanup(authenticated_client, db_session, tmp_path):
    """Test bulk delete with actual file cleanup"""
    
    job_ids = []
    file_paths = []
    
    # Create jobs with actual files
    for i in range(3):
        # Create test file
        file_path = tmp_path / f"test_{i}.mp3"
        file_path.write_text("test audio content")
        file_paths.append(str(file_path))
        
        job = Job(
            id=uuid4(),
            status=JobStatus.COMPLETED,
            job_type=JobType.TRANSCRIPTION,
            provider="whisper",
            model_name="base",
            file_path=str(file_path),
            original_filename=f"test_{i}.mp3",
            progress=100
        )
        db_session.add(job)
        job_ids.append(str(job.id))
    
    await db_session.commit()
    
    # Verify files exist before delete
    for file_path in file_paths:
        assert Path(file_path).exists()
    
    # Test bulk delete
    response = await authenticated_client.post(
        "/api/v1/jobs/bulk/delete",
        json={"job_ids": job_ids}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["deleted_count"] == 3
    
    # Verify files are deleted
    for file_path in file_paths:
        assert not Path(file_path).exists()


@pytest.mark.asyncio
async def test_bulk_delete_processing_jobs(authenticated_client, db_session):
    """Test bulk delete cancels processing jobs before deleting"""
    
    job_ids = []
    
    # Create processing jobs
    for i in range(2):
        job = Job(
            id=uuid4(),
            status=JobStatus.PROCESSING,
            job_type=JobType.TRANSCRIPTION,
            provider="whisper",
            model_name="base",
            file_path=f"/tmp/test_{i}.mp3",
            original_filename=f"test_{i}.mp3",
            progress=50
        )
        db_session.add(job)
        job_ids.append(str(job.id))
    
    await db_session.commit()
    
    # Test bulk delete
    response = await authenticated_client.post(
        "/api/v1/jobs/bulk/delete",
        json={"job_ids": job_ids}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["deleted_count"] == 2


@pytest.mark.asyncio
async def test_bulk_delete_mixed_statuses(authenticated_client, db_session):
    """Test bulk delete with jobs in different statuses"""
    
    job_ids = []
    statuses = [JobStatus.COMPLETED, JobStatus.PROCESSING, JobStatus.FAILED, JobStatus.CANCELLED]
    
    # Create jobs with different statuses
    for i, status in enumerate(statuses):
        job = Job(
            id=uuid4(),
            status=status,
            job_type=JobType.TRANSCRIPTION,
            provider="whisper",
            model_name="base",
            file_path=f"/tmp/test_{i}.mp3",
            original_filename=f"test_{i}.mp3",
            progress=100 if status == JobStatus.COMPLETED else 50
        )
        db_session.add(job)
        job_ids.append(str(job.id))
    
    await db_session.commit()
    
    # Test bulk delete
    response = await authenticated_client.post(
        "/api/v1/jobs/bulk/delete",
        json={"job_ids": job_ids}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["deleted_count"] == 4


@pytest.mark.asyncio
async def test_bulk_delete_invalid_job_id_format(authenticated_client):
    """Test bulk delete with invalid UUID format"""
    
    response = await authenticated_client.post(
        "/api/v1/jobs/bulk/delete",
        json={"job_ids": ["invalid-uuid"]}
    )
    
    # Should still process, but count as failed
    assert response.status_code in [200, 400]
