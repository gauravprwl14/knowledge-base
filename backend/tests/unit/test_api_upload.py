"""
Unit tests for upload API endpoint
"""
import pytest
from httpx import AsyncClient


class TestUploadEndpoint:
    """Tests for file upload endpoint"""

    @pytest.mark.asyncio
    async def test_upload_audio_file_success(
        self,
        authenticated_client: AsyncClient,
        test_audio_file
    ):
        """Test successful audio file upload"""
        with open(test_audio_file, 'rb') as f:
            response = await authenticated_client.post(
                "/api/v1/upload",
                files={"file": ("test.wav", f, "audio/wav")},
                data={
                    "provider": "whisper",
                    "model_name": "tiny",
                    "language": "en"
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert "job_id" in data
        assert data["filename"] == "test.wav"
        assert data["status"] == "pending"
        assert "message" in data

    @pytest.mark.asyncio
    async def test_upload_without_api_key(
        self,
        client: AsyncClient,
        test_audio_file
    ):
        """Test upload without API key fails"""
        with open(test_audio_file, 'rb') as f:
            response = await client.post(
                "/api/v1/upload",
                files={"file": ("test.wav", f, "audio/wav")},
                data={"provider": "whisper"}
            )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_upload_with_invalid_api_key(
        self,
        client: AsyncClient,
        test_audio_file
    ):
        """Test upload with invalid API key fails"""
        client.headers["X-API-Key"] = "invalid_key"

        with open(test_audio_file, 'rb') as f:
            response = await client.post(
                "/api/v1/upload",
                files={"file": ("test.wav", f, "audio/wav")},
                data={"provider": "whisper"}
            )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_upload_without_file(
        self,
        authenticated_client: AsyncClient
    ):
        """Test upload without file fails"""
        response = await authenticated_client.post(
            "/api/v1/upload",
            data={"provider": "whisper"}
        )

        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_upload_with_invalid_provider(
        self,
        authenticated_client: AsyncClient,
        test_audio_file
    ):
        """Test upload with invalid provider"""
        with open(test_audio_file, 'rb') as f:
            response = await authenticated_client.post(
                "/api/v1/upload",
                files={"file": ("test.wav", f, "audio/wav")},
                data={"provider": "invalid_provider"}
            )

        # Should either reject or default to valid provider
        assert response.status_code in [400, 422]

    @pytest.mark.asyncio
    async def test_upload_multiple_providers(
        self,
        authenticated_client: AsyncClient,
        test_audio_file
    ):
        """Test upload with different providers"""
        providers = ["whisper", "groq", "deepgram"]

        for provider in providers:
            with open(test_audio_file, 'rb') as f:
                response = await authenticated_client.post(
                    "/api/v1/upload",
                    files={"file": ("test.wav", f, "audio/wav")},
                    data={
                        "provider": provider,
                        "model_name": "tiny" if provider == "whisper" else "whisper-large-v3-turbo"
                    }
                )

            # Whisper should work, cloud providers might not have API keys
            assert response.status_code in [200, 400]
            if response.status_code == 200:
                data = response.json()
                assert "job_id" in data
