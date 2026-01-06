import aiohttp
from typing import Optional

from app.services.transcription.base import (
    TranscriptionProvider,
    TranscriptionResult,
    TimeMeasure
)
from app.config import get_settings

settings = get_settings()


class GroqTranscriptionProvider(TranscriptionProvider):
    """Groq cloud transcription service."""

    name = "groq"
    API_URL = "https://api.groq.com/openai/v1/audio/transcriptions"

    def __init__(self):
        self.api_key = settings.groq_api_key

    async def is_available(self) -> bool:
        """Check if Groq API key is configured."""
        return bool(self.api_key)

    async def transcribe(
        self,
        audio_path: str,
        model: Optional[str] = None,
        language: Optional[str] = None,
        **kwargs
    ) -> TranscriptionResult:
        """
        Transcribe audio using Groq's cloud API.

        Args:
            audio_path: Path to audio file
            model: Model name (e.g., 'whisper-large-v3-turbo')
            language: Language code
        """
        if not self.api_key:
            raise ValueError("Groq API key not configured")

        model_name = model or "whisper-large-v3-turbo"

        # Read audio file
        with open(audio_path, "rb") as f:
            audio_data = f.read()

        # Prepare multipart form data
        data = aiohttp.FormData()
        data.add_field(
            "file",
            audio_data,
            filename="audio.wav",
            content_type="audio/wav"
        )
        data.add_field("model", model_name)
        data.add_field("response_format", "json")
        data.add_field("temperature", "0")

        if language and language != "auto":
            data.add_field("language", language)

        headers = {
            "Authorization": f"Bearer {self.api_key}"
        }

        with TimeMeasure() as timer:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.API_URL,
                    data=data,
                    headers=headers
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise Exception(f"Groq API error ({response.status}): {error_text}")

                    result = await response.json()

        text = result.get("text", "").strip()
        detected_language = result.get("language")

        return TranscriptionResult(
            text=text,
            language=detected_language or language,
            processing_time_ms=timer.elapsed_ms,
            provider=self.name,
            model=model_name
        )
