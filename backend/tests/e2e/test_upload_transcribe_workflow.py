"""
End-to-end tests for complete upload and transcription workflow
"""
import pytest
import asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


class TestUploadTranscribeWorkflow:
    """E2E tests for the complete upload to transcription workflow"""

    @pytest.mark.asyncio
    async def test_complete_audio_transcription_workflow(
        self,
        authenticated_client: AsyncClient,
        test_audio_file,
        db_session: AsyncSession
    ):
        """
        Test complete workflow:
        1. Upload audio file
        2. Check job status
        3. Wait for processing (simulate)
        4. Retrieve transcription
        5. Download in different formats
        """
        # Step 1: Upload file
        with open(test_audio_file, 'rb') as f:
            upload_response = await authenticated_client.post(
                "/api/v1/upload",
                files={"file": ("test.wav", f, "audio/wav")},
                data={
                    "provider": "whisper",
                    "model_name": "tiny",
                    "language": "en"
                }
            )

        assert upload_response.status_code == 200
        upload_data = upload_response.json()
        job_id = upload_data["job_id"]
        assert job_id is not None

        # Step 2: Check job status
        job_response = await authenticated_client.get(f"/api/v1/jobs/{job_id}")
        assert job_response.status_code == 200
        job_data = job_response.json()
        assert job_data["id"] == job_id
        assert job_data["status"] in ["pending", "processing", "completed"]

        # Step 3: In a real test, we would wait for the worker to process
        # For unit testing, we'll simulate by marking as completed
        from app.db.models import Job, Transcription
        from sqlalchemy import select

        result = await db_session.execute(
            select(Job).where(Job.id == job_id)
        )
        job = result.scalar_one()
        job.status = "completed"

        # Create a test transcription
        transcription = Transcription(
            job_id=job.id,
            text="This is a test transcription.",
            language="en",
            provider="whisper",
            model_name="tiny",
            word_count=5,
            processing_time_ms=500
        )
        db_session.add(transcription)
        await db_session.commit()
        await db_session.refresh(transcription)

        # Step 4: List transcriptions
        transcriptions_response = await authenticated_client.get(
            "/api/v1/transcriptions"
        )
        assert transcriptions_response.status_code == 200
        transcriptions_data = transcriptions_response.json()
        assert transcriptions_data["total"] >= 1

        # Step 5: Get specific transcription
        transcription_response = await authenticated_client.get(
            f"/api/v1/transcriptions/{transcription.id}"
        )
        assert transcription_response.status_code == 200
        transcription_data = transcription_response.json()
        assert transcription_data["text"] == "This is a test transcription."

        # Step 6: Download in different formats
        formats = ["txt", "json", "srt"]
        for format_type in formats:
            download_response = await authenticated_client.get(
                f"/api/v1/transcriptions/{transcription.id}/download",
                params={"format": format_type}
            )
            assert download_response.status_code == 200

    @pytest.mark.asyncio
    async def test_multiple_file_upload_workflow(
        self,
        authenticated_client: AsyncClient,
        test_audio_file,
        db_session: AsyncSession
    ):
        """Test uploading multiple files"""
        job_ids = []

        # Upload 3 files
        for i in range(3):
            with open(test_audio_file, 'rb') as f:
                response = await authenticated_client.post(
                    "/api/v1/upload",
                    files={"file": (f"test_{i}.wav", f, "audio/wav")},
                    data={
                        "provider": "whisper",
                        "model_name": "tiny",
                        "language": "en"
                    }
                )

            assert response.status_code == 200
            data = response.json()
            job_ids.append(data["job_id"])

        # Verify all jobs were created
        jobs_response = await authenticated_client.get("/api/v1/jobs")
        assert jobs_response.status_code == 200
        jobs_data = jobs_response.json()
        assert jobs_data["total"] >= 3

        # Check each job exists
        for job_id in job_ids:
            job_response = await authenticated_client.get(f"/api/v1/jobs/{job_id}")
            assert job_response.status_code == 200

    @pytest.mark.asyncio
    async def test_error_handling_workflow(
        self,
        authenticated_client: AsyncClient
    ):
        """Test error handling in the workflow"""
        # Test 1: Upload without file
        response = await authenticated_client.post(
            "/api/v1/upload",
            data={"provider": "whisper"}
        )
        assert response.status_code == 422

        # Test 2: Get non-existent job
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = await authenticated_client.get(f"/api/v1/jobs/{fake_id}")
        assert response.status_code == 404

        # Test 3: Get non-existent transcription
        response = await authenticated_client.get(f"/api/v1/transcriptions/{fake_id}")
        assert response.status_code == 404

        # Test 4: Download with invalid format
        response = await authenticated_client.get(
            f"/api/v1/transcriptions/{fake_id}/download?format=invalid"
        )
        assert response.status_code in [400, 404]

    @pytest.mark.asyncio
    async def test_job_status_transitions(
        self,
        authenticated_client: AsyncClient,
        test_audio_file,
        db_session: AsyncSession
    ):
        """Test job status transitions through the workflow"""
        # Upload file
        with open(test_audio_file, 'rb') as f:
            response = await authenticated_client.post(
                "/api/v1/upload",
                files={"file": ("test.wav", f, "audio/wav")},
                data={"provider": "whisper", "model_name": "tiny"}
            )

        assert response.status_code == 200
        job_id = response.json()["job_id"]

        # Initial status should be pending
        response = await authenticated_client.get(f"/api/v1/jobs/{job_id}")
        assert response.status_code == 200
        assert response.json()["status"] in ["pending", "queued"]

        # Simulate status progression
        from app.db.models import Job
        from sqlalchemy import select

        result = await db_session.execute(
            select(Job).where(Job.id == job_id)
        )
        job = result.scalar_one()

        # Processing
        job.status = "processing"
        await db_session.commit()

        response = await authenticated_client.get(f"/api/v1/jobs/{job_id}")
        assert response.status_code == 200
        assert response.json()["status"] == "processing"

        # Completed
        job.status = "completed"
        await db_session.commit()

        response = await authenticated_client.get(f"/api/v1/jobs/{job_id}")
        assert response.status_code == 200
        assert response.json()["status"] == "completed"
