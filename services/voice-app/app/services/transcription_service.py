"""Whisper-based audio transcription service.

Uses ``faster-whisper`` (CTranslate2 backend) for efficient local inference.
The Whisper model is lazy-loaded on the first ``transcribe()`` call to avoid
slowing down service startup.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass

import structlog

from app.utils.errors import TranscriptionError

logger = structlog.get_logger(__name__)

SUPPORTED_MODELS = {"tiny", "base", "small", "medium"}


@dataclass
class TranscriptResult:
    """Result produced by the transcription service.

    Attributes:
        text: Full transcribed text.
        language: Detected or specified language code (BCP-47).
        duration_seconds: Duration of the audio file in seconds.
    """

    text: str
    language: str
    duration_seconds: float


class TranscriptionService:
    """Wraps ``faster-whisper`` to provide async-compatible transcription.

    The underlying ``WhisperModel`` is loaded lazily on the first call to
    :meth:`transcribe` and reused for subsequent calls.

    Args:
        default_model: Whisper model size to use when no override is supplied.
            Must be one of ``tiny``, ``base``, ``small``, ``medium``.
    """

    def __init__(self, default_model: str = "base") -> None:
        self._default_model = default_model
        self._models: dict[str, object] = {}

    def _load_model(self, model_name: str) -> object:
        """Load and cache a WhisperModel by name.

        Args:
            model_name: Whisper model size identifier.

        Returns:
            A loaded ``faster_whisper.WhisperModel`` instance.
        """
        if model_name not in self._models:
            from faster_whisper import WhisperModel  # type: ignore[import]

            log = logger.bind(model=model_name)
            log.info("Loading Whisper model")
            t0 = time.monotonic()
            self._models[model_name] = WhisperModel(model_name, device="cpu", compute_type="int8")
            elapsed = time.monotonic() - t0
            log.info("Whisper model loaded", load_time_seconds=round(elapsed, 2))

        return self._models[model_name]

    async def transcribe(
        self,
        file_path: str,
        language: str | None,
        model: str | None = None,
    ) -> TranscriptResult:
        """Transcribe an audio or video file using Whisper.

        Args:
            file_path: Absolute path to the audio/video file on disk.
            language: BCP-47 language code (e.g. ``"en"``). Pass ``None`` to
                let Whisper auto-detect the language.
            model: Whisper model size override. Falls back to the instance
                default when ``None``.

        Returns:
            A :class:`TranscriptResult` with the transcript text, detected
            language, and audio duration.

        Raises:
            TranscriptionError: If the file does not exist, or if Whisper
                raises any exception during inference.
        """
        model_name = model or self._default_model
        if model_name not in SUPPORTED_MODELS:
            model_name = self._default_model

        if not os.path.exists(file_path):
            raise TranscriptionError(
                file_path=file_path,
                reason="File does not exist",
                retryable=False,
            )

        log = logger.bind(file_path=file_path, model=model_name, language=language)
        log.info("Starting transcription")

        try:
            whisper_model = self._load_model(model_name)
            transcribe_kwargs: dict = {}
            if language:
                transcribe_kwargs["language"] = language

            segments, info = whisper_model.transcribe(file_path, **transcribe_kwargs)  # type: ignore[attr-defined]

            text_parts: list[str] = []
            duration: float = 0.0
            for segment in segments:
                text_parts.append(segment.text.strip())
                duration = max(duration, segment.end)

            transcript_text = " ".join(text_parts)
            detected_language: str = getattr(info, "language", language or "unknown")

            log.info(
                "Transcription complete",
                duration_seconds=round(duration, 2),
                language=detected_language,
                chars=len(transcript_text),
            )

            return TranscriptResult(
                text=transcript_text,
                language=detected_language,
                duration_seconds=duration,
            )

        except TranscriptionError:
            raise
        except Exception as exc:
            raise TranscriptionError(
                file_path=file_path,
                reason=str(exc),
                retryable=False,
            ) from exc
