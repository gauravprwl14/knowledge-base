"""Whisper model abstraction for audio transcription.

Tries ``faster-whisper`` (CTranslate2 backend) first for performance; falls
back to ``openai-whisper`` when ``faster-whisper`` is not installed.

The model is loaded eagerly at service startup via :meth:`WhisperService.load`
and is reused across all subsequent :meth:`WhisperService.transcribe` calls.
CPU-bound inference is offloaded to a thread-pool executor so the asyncio event
loop is never blocked.
"""
from __future__ import annotations

import asyncio
from typing import Any

import structlog

from app.config import settings
from app.utils.errors import TranscriptionError

logger = structlog.get_logger(__name__)


class WhisperService:
    """Wraps faster-whisper (or openai-whisper) for audio transcription.

    Usage::

        svc = WhisperService()
        svc.load()                          # call once at startup
        text = await svc.transcribe("/path/to/audio.mp3")

    Attributes:
        _model: Loaded model instance; ``None`` until :meth:`load` is called.
        _backend: Either ``"faster-whisper"`` or ``"openai-whisper"``.
    """

    def __init__(self) -> None:
        self._model: Any = None
        self._backend: str = "unknown"

    def load(self) -> None:
        """Load the Whisper model at startup (called once in lifespan).

        Tries ``faster-whisper`` first; falls back to ``openai-whisper`` if
        ``faster-whisper`` is not installed.

        Raises:
            RuntimeError: If neither backend can be imported.
        """
        try:
            from faster_whisper import WhisperModel  # type: ignore[import]

            self._model = WhisperModel(
                settings.whisper_model,
                device=settings.whisper_device,
                compute_type="int8",
            )
            self._backend = "faster-whisper"
            logger.info(
                "whisper_model_loaded",
                backend=self._backend,
                model=settings.whisper_model,
                device=settings.whisper_device,
            )
        except ImportError:
            import whisper  # type: ignore[import]

            self._model = whisper.load_model(settings.whisper_model)
            self._backend = "openai-whisper"
            logger.info(
                "whisper_model_loaded",
                backend=self._backend,
                model=settings.whisper_model,
            )

    async def transcribe(self, file_path: str, language: str | None = None) -> str:
        """Transcribe an audio file to plain text.

        Runs the CPU-bound Whisper inference in a thread-pool executor so the
        asyncio event loop is not blocked.

        Args:
            file_path: Absolute path to the audio/video file on disk.
            language: Optional BCP-47 language hint. ``None`` lets Whisper
                auto-detect the language.

        Returns:
            The full transcribed text as a single string.

        Raises:
            TranscriptionError: If the model has not been loaded, the file
                does not exist, or Whisper raises any exception.
        """
        if self._model is None:
            raise TranscriptionError(
                file_path=file_path,
                reason="WhisperService.load() was not called before transcribe()",
                retryable=False,
            )

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._transcribe_sync, file_path, language)

    def _transcribe_sync(self, file_path: str, language: str | None) -> str:
        """Synchronous transcription — runs inside a thread-pool executor.

        Handles both ``faster-whisper`` and ``openai-whisper`` interfaces.

        Args:
            file_path: Absolute path to the audio/video file.
            language: Optional BCP-47 language hint.

        Returns:
            Transcribed text joined into a single string.

        Raises:
            TranscriptionError: On any Whisper-level failure.
        """
        log = logger.bind(
            file_path=file_path,
            language=language,
            backend=self._backend,
            model=settings.whisper_model,
        )
        log.info("transcription_started")

        try:
            if self._backend == "faster-whisper":
                return self._transcribe_faster_whisper(file_path, language, log)
            else:
                return self._transcribe_openai_whisper(file_path, language, log)
        except TranscriptionError:
            raise
        except Exception as exc:
            log.exception("transcription_failed", error=str(exc))
            raise TranscriptionError(
                file_path=file_path,
                reason=str(exc),
                retryable=False,
            ) from exc

    def _transcribe_faster_whisper(
        self,
        file_path: str,
        language: str | None,
        log: Any,
    ) -> str:
        """Transcribe using the faster-whisper backend.

        Args:
            file_path: Path to the audio file.
            language: Optional language hint.
            log: Bound structlog logger instance.

        Returns:
            Concatenated transcript text.
        """
        kwargs: dict = {}
        if language:
            kwargs["language"] = language

        segments, info = self._model.transcribe(file_path, **kwargs)  # type: ignore[attr-defined]

        text_parts: list[str] = []
        duration: float = 0.0
        for segment in segments:
            text_parts.append(segment.text.strip())
            duration = max(duration, segment.end)

        transcript = " ".join(text_parts)
        detected_language = getattr(info, "language", language or "unknown")

        log.info(
            "transcription_completed",
            chars=len(transcript),
            duration_seconds=round(duration, 2),
            detected_language=detected_language,
        )
        return transcript

    def _transcribe_openai_whisper(
        self,
        file_path: str,
        language: str | None,
        log: Any,
    ) -> str:
        """Transcribe using the openai-whisper backend.

        Args:
            file_path: Path to the audio file.
            language: Optional language hint.
            log: Bound structlog logger instance.

        Returns:
            Transcript text from the ``text`` key of the Whisper result dict.
        """
        kwargs: dict = {}
        if language:
            kwargs["language"] = language

        result = self._model.transcribe(file_path, **kwargs)  # type: ignore[attr-defined]
        transcript: str = result.get("text", "").strip()

        log.info(
            "transcription_completed",
            chars=len(transcript),
            detected_language=result.get("language", language or "unknown"),
        )
        return transcript
