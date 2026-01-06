import aiohttp
from typing import Optional
from urllib.parse import urlencode

from app.services.transcription.base import (
    TranscriptionProvider,
    TranscriptionResult,
    TranscriptionSegment,
    TimeMeasure
)
from app.config import get_settings

settings = get_settings()


class DeepgramTranscriptionProvider(TranscriptionProvider):
    """Deepgram cloud transcription service."""

    name = "deepgram"
    API_URL = "https://api.deepgram.com/v1/listen"

    def __init__(self):
        self.api_key = settings.deepgram_api_key

    async def is_available(self) -> bool:
        """Check if Deepgram API key is configured."""
        return bool(self.api_key)

    async def transcribe(
        self,
        audio_path: str,
        model: Optional[str] = None,
        language: Optional[str] = None,
        **kwargs
    ) -> TranscriptionResult:
        """
        Transcribe audio using Deepgram's cloud API.

        Args:
            audio_path: Path to audio file
            model: Model name (e.g., 'nova-3', 'nova-2')
            language: Language code
        """
        if not self.api_key:
            raise ValueError("Deepgram API key not configured")

        # Select model based on language
        # Nova-3 is best for English, Nova-2 for other languages
        model_name = model or ("nova-3" if language == "en" else "nova-2")

        # Read audio file
        with open(audio_path, "rb") as f:
            audio_data = f.read()

        # Build query parameters
        params = {
            "model": model_name,
            "smart_format": "true",
            "punctuate": "true",
            "paragraphs": "true",
        }

        if language and language != "auto":
            params["language"] = language

        url = f"{self.API_URL}?{urlencode(params)}"

        headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "audio/wav"
        }

        with TimeMeasure() as timer:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    data=audio_data,
                    headers=headers
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise Exception(f"Deepgram API error ({response.status}): {error_text}")

                    result = await response.json()

        # Extract transcription from Deepgram response
        channels = result.get("results", {}).get("channels", [])
        if not channels:
            return TranscriptionResult(
                text="",
                provider=self.name,
                model=model_name,
                processing_time_ms=timer.elapsed_ms
            )

        alternatives = channels[0].get("alternatives", [])
        if not alternatives:
            return TranscriptionResult(
                text="",
                provider=self.name,
                model=model_name,
                processing_time_ms=timer.elapsed_ms
            )

        best_alternative = alternatives[0]
        text = best_alternative.get("transcript", "").strip()
        confidence = best_alternative.get("confidence")

        # Extract word-level segments if available
        segments = []
        words = best_alternative.get("words", [])
        if words:
            # Group words into segments (by sentence or phrase)
            current_segment_words = []
            current_start = None

            for word in words:
                if current_start is None:
                    current_start = word.get("start", 0)
                current_segment_words.append(word.get("word", ""))

                # End segment on punctuation
                if word.get("punctuated_word", "").endswith((".", "!", "?", ":")):
                    segments.append(TranscriptionSegment(
                        start=current_start,
                        end=word.get("end", current_start + 1),
                        text=" ".join(current_segment_words)
                    ))
                    current_segment_words = []
                    current_start = None

            # Add remaining words
            if current_segment_words:
                segments.append(TranscriptionSegment(
                    start=current_start,
                    end=words[-1].get("end", current_start + 1),
                    text=" ".join(current_segment_words)
                ))

        # Get detected language
        detected_language = result.get("results", {}).get("channels", [{}])[0].get("detected_language")

        # Get duration from metadata
        duration = result.get("metadata", {}).get("duration")

        return TranscriptionResult(
            text=text,
            language=detected_language or language,
            confidence=confidence,
            duration_seconds=duration,
            processing_time_ms=timer.elapsed_ms,
            segments=segments if segments else None,
            provider=self.name,
            model=model_name
        )
