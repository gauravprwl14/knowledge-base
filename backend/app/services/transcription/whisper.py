import os
from pathlib import Path
from typing import Optional
import asyncio

from app.services.transcription.base import (
    TranscriptionProvider,
    TranscriptionResult,
    TranscriptionSegment,
    TimeMeasure
)
from app.config import get_settings

settings = get_settings()


class WhisperTranscriptionProvider(TranscriptionProvider):
    """Local Whisper transcription using faster-whisper (4x faster, ARM64 compatible)."""

    name = "whisper"

    def __init__(self):
        self.models_dir = Path(settings.models_dir)
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self._model_cache = {}

    async def is_available(self) -> bool:
        """Check if faster-whisper is installed."""
        try:
            from faster_whisper import WhisperModel
            return True
        except ImportError:
            return False

    async def transcribe(
        self,
        audio_path: str,
        model: Optional[str] = None,
        language: Optional[str] = None,
        **kwargs
    ) -> TranscriptionResult:
        """
        Transcribe audio using local Whisper model via faster-whisper.

        Args:
            audio_path: Path to audio file (supports many formats via ffmpeg)
            model: Model name (tiny, base, small, medium, large-v2, large-v3, etc.)
            language: Language code or 'auto' for auto-detection
        """
        from faster_whisper import WhisperModel

        model_name = model or "base"

        # Load or get cached model
        if model_name not in self._model_cache:
            # faster-whisper automatically downloads models to cache
            # Using int8 quantization for better performance on CPU/ARM64
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: WhisperModel(
                    model_name,
                    device="cpu",
                    compute_type="int8",
                    download_root=str(self.models_dir)
                )
            )
            self._model_cache[model_name] = WhisperModel(
                model_name,
                device="cpu",
                compute_type="int8",
                download_root=str(self.models_dir)
            )

        whisper_model = self._model_cache[model_name]

        # Set language
        lang = None if language == "auto" or not language else language

        with TimeMeasure() as timer:
            # Transcribe - run in executor to avoid blocking
            segments_generator, info = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: whisper_model.transcribe(
                    audio_path,
                    language=lang,
                    beam_size=5,
                    vad_filter=True  # Voice activity detection for better accuracy
                )
            )

        # Extract results
        text_parts = []
        result_segments = []

        for segment in segments_generator:
            text_parts.append(segment.text)
            result_segments.append(TranscriptionSegment(
                start=segment.start,
                end=segment.end,
                text=segment.text
            ))

        full_text = " ".join(text_parts).strip()

        return TranscriptionResult(
            text=full_text,
            language=info.language if hasattr(info, 'language') else language,
            processing_time_ms=timer.elapsed_ms,
            segments=result_segments,
            provider=self.name,
            model=model_name
        )
