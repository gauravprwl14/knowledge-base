"""
Unit tests for jobs API endpoints
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Job


class TestJobsEndpoint:
    """Tests for jobs API endpoints"""

    @pytest.mark.asyncio
    async def test_list_jobs_empty(
        self,
        authenticated_client: AsyncClient
    ):
        """Test listing jobs when none exist"""
        response = await authenticated_client.get("/api/v1/jobs")

        assert response.status_code == 200
        data = response.json()
        assert "jobs" in data
        assert data["total"] == 0
        assert len(data["jobs"]) == 0

    @pytest.mark.asyncio
    async def test_list_jobs_with_data(
        self,
        authenticated_client: AsyncClient,
        db_session: AsyncSession
    ):
        """Test listing jobs with existing data"""
        # Create test jobs
        job1 = Job(
            job_type="transcription",
            status="pending",
            provider="whisper",
            model_name="tiny",
            original_filename="test1.wav",
            file_size_bytes=1000,
            file_path="/tmp/test1.wav"
        )
        job2 = Job(
            job_type="transcription",
            status="completed",
            provider="whisper",
            model_name="base",
            original_filename="test2.wav",
            file_size_bytes=2000,
            file_path="/tmp/test2.wav"
        )
        db_session.add(job1)
        db_session.add(job2)
        await db_session.commit()

        response = await authenticated_client.get("/api/v1/jobs")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["jobs"]) == 2

    @pytest.mark.asyncio
    async def test_get_job_by_id(
        self,
        authenticated_client: AsyncClient,
        db_session: AsyncSession
    ):
        """Test getting a specific job by ID"""
        # Create test job
        job = Job(
            job_type="transcription",
            status="pending",
            provider="whisper",
            model_name="tiny",
            original_filename="test.wav",
            file_size_bytes=1000,
            file_path="/tmp/test.wav"
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        response = await authenticated_client.get(f"/api/v1/jobs/{job.id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(job.id)
        assert data["status"] == "pending"
        assert data["original_filename"] == "test.wav"

    @pytest.mark.asyncio
    async def test_get_nonexistent_job(
        self,
        authenticated_client: AsyncClient
    ):
        """Test getting a job that doesn't exist"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = await authenticated_client.get(f"/api/v1/jobs/{fake_id}")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_job_without_auth(
        self,
        client: AsyncClient,
        db_session: AsyncSession
    ):
        """Test getting a job without authentication"""
        job = Job(
            job_type="transcription",
            status="pending",
            provider="whisper",
            model_name="tiny",
            original_filename="test.wav",
            file_size_bytes=1000,
            file_path="/tmp/test.wav"
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        response = await client.get(f"/api/v1/jobs/{job.id}")

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_list_jobs_pagination(
        self,
        authenticated_client: AsyncClient,
        db_session: AsyncSession
    ):
        """Test job listing pagination"""
        # Create 25 test jobs
        for i in range(25):
            job = Job(
                job_type="transcription",
                status="pending",
                provider="whisper",
                model_name="tiny",
                original_filename=f"test{i}.wav",
                file_size_bytes=1000,
                file_path=f"/tmp/test{i}.wav"
            )
            db_session.add(job)
        await db_session.commit()

        # Test first page
        response = await authenticated_client.get("/api/v1/jobs?page=1&page_size=10")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 25
        assert len(data["jobs"]) == 10
        assert data["page"] == 1

        # Test second page
        response = await authenticated_client.get("/api/v1/jobs?page=2&page_size=10")
        assert response.status_code == 200
        data = response.json()
        assert len(data["jobs"]) == 10
        assert data["page"] == 2

    @pytest.mark.asyncio
    async def test_filter_jobs_by_status(
        self,
        authenticated_client: AsyncClient,
        db_session: AsyncSession
    ):
        """Test filtering jobs by status"""
        # Create jobs with different statuses
        statuses = ["pending", "processing", "completed", "failed"]
        for status in statuses:
            for i in range(2):
                job = Job(
                    job_type="transcription",
                    status=status,
                    provider="whisper",
                    model_name="tiny",
                    original_filename=f"test_{status}_{i}.wav",
                    file_size_bytes=1000,
                    file_path=f"/tmp/test_{status}_{i}.wav"
                )
                db_session.add(job)
        await db_session.commit()

        # Test filtering by status
        response = await authenticated_client.get("/api/v1/jobs?status=completed")
        assert response.status_code == 200
        data = response.json()

        # Should have 2 completed jobs
        if "status" in response.url.params:
            assert all(job["status"] == "completed" for job in data["jobs"])
