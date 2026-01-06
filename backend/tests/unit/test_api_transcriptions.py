"""
Unit tests for transcriptions API endpoints
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Job, Transcription


class TestTranscriptionsEndpoint:
    """Tests for transcriptions API endpoints"""

    @pytest.mark.asyncio
    async def test_list_transcriptions_empty(
        self,
        authenticated_client: AsyncClient
    ):
        """Test listing transcriptions when none exist"""
        response = await authenticated_client.get("/api/v1/transcriptions")

        assert response.status_code == 200
        data = response.json()
        assert "transcriptions" in data
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_transcription_by_id(
        self,
        authenticated_client: AsyncClient,
        db_session: AsyncSession
    ):
        """Test getting a specific transcription"""
        # Create job first
        job = Job(
            job_type="transcription",
            status="completed",
            provider="whisper",
            model_name="tiny",
            original_filename="test.wav",
            file_size_bytes=1000,
            file_path="/tmp/test.wav"
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        # Create transcription
        transcription = Transcription(
            job_id=job.id,
            text="Hello, this is a test transcription.",
            language="en",
            provider="whisper",
            model_name="tiny",
            word_count=6,
            processing_time_ms=1000
        )
        db_session.add(transcription)
        await db_session.commit()
        await db_session.refresh(transcription)

        response = await authenticated_client.get(
            f"/api/v1/transcriptions/{transcription.id}"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(transcription.id)
        assert data["text"] == "Hello, this is a test transcription."
        assert data["language"] == "en"
        assert data["word_count"] == 6

    @pytest.mark.asyncio
    async def test_download_transcription_txt(
        self,
        authenticated_client: AsyncClient,
        db_session: AsyncSession
    ):
        """Test downloading transcription as TXT"""
        # Create job and transcription
        job = Job(
            job_type="transcription",
            status="completed",
            provider="whisper",
            model_name="tiny",
            original_filename="test.wav",
            file_size_bytes=1000,
            file_path="/tmp/test.wav"
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        transcription = Transcription(
            job_id=job.id,
            text="Test transcription text.",
            language="en",
            provider="whisper",
            model_name="tiny"
        )
        db_session.add(transcription)
        await db_session.commit()
        await db_session.refresh(transcription)

        response = await authenticated_client.get(
            f"/api/v1/transcriptions/{transcription.id}/download?format=txt"
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "text/plain; charset=utf-8"
        assert "Test transcription text." in response.text

    @pytest.mark.asyncio
    async def test_download_transcription_json(
        self,
        authenticated_client: AsyncClient,
        db_session: AsyncSession
    ):
        """Test downloading transcription as JSON"""
        # Create job and transcription
        job = Job(
            job_type="transcription",
            status="completed",
            provider="whisper",
            model_name="tiny",
            original_filename="test.wav",
            file_size_bytes=1000,
            file_path="/tmp/test.wav"
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        transcription = Transcription(
            job_id=job.id,
            text="Test transcription.",
            language="en",
            provider="whisper",
            model_name="tiny"
        )
        db_session.add(transcription)
        await db_session.commit()
        await db_session.refresh(transcription)

        response = await authenticated_client.get(
            f"/api/v1/transcriptions/{transcription.id}/download?format=json"
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"
        data = response.json()
        assert "text" in data
        assert data["text"] == "Test transcription."

    @pytest.mark.asyncio
    async def test_download_transcription_srt(
        self,
        authenticated_client: AsyncClient,
        db_session: AsyncSession
    ):
        """Test downloading transcription as SRT"""
        job = Job(
            job_type="transcription",
            status="completed",
            provider="whisper",
            model_name="tiny",
            original_filename="test.wav",
            file_size_bytes=1000,
            file_path="/tmp/test.wav"
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        transcription = Transcription(
            job_id=job.id,
            text="Test transcription.",
            language="en",
            provider="whisper",
            model_name="tiny"
        )
        db_session.add(transcription)
        await db_session.commit()
        await db_session.refresh(transcription)

        response = await authenticated_client.get(
            f"/api/v1/transcriptions/{transcription.id}/download?format=srt"
        )

        assert response.status_code == 200
        # SRT format starts with "1\n" for the first subtitle
        assert "1\n" in response.text or response.text.startswith("1\n")

    @pytest.mark.asyncio
    async def test_download_invalid_format(
        self,
        authenticated_client: AsyncClient,
        db_session: AsyncSession
    ):
        """Test downloading with invalid format"""
        job = Job(
            job_type="transcription",
            status="completed",
            provider="whisper",
            model_name="tiny",
            original_filename="test.wav",
            file_size_bytes=1000,
            file_path="/tmp/test.wav"
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        transcription = Transcription(
            job_id=job.id,
            text="Test transcription.",
            language="en",
            provider="whisper",
            model_name="tiny"
        )
        db_session.add(transcription)
        await db_session.commit()
        await db_session.refresh(transcription)

        response = await authenticated_client.get(
            f"/api/v1/transcriptions/{transcription.id}/download?format=pdf"
        )

        assert response.status_code == 400
