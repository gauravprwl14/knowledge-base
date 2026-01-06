from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, List
import time


@dataclass
class TranscriptionSegment:
    """A segment of transcribed text with timing."""
    start: float
    end: float
    text: str


@dataclass
class TranscriptionResult:
    """Result of a transcription operation."""
    text: str
    language: Optional[str] = None
    confidence: Optional[float] = None
    duration_seconds: Optional[float] = None
    processing_time_ms: Optional[int] = None
    segments: Optional[List[TranscriptionSegment]] = None
    provider: Optional[str] = None
    model: Optional[str] = None

    @property
    def word_count(self) -> int:
        """Count words in transcription."""
        return len(self.text.split()) if self.text else 0

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "text": self.text,
            "language": self.language,
            "confidence": self.confidence,
            "duration_seconds": self.duration_seconds,
            "processing_time_ms": self.processing_time_ms,
            "word_count": self.word_count,
            "segments": [
                {"start": s.start, "end": s.end, "text": s.text}
                for s in (self.segments or [])
            ],
            "provider": self.provider,
            "model": self.model
        }


class TranscriptionProvider(ABC):
    """Abstract base class for transcription providers."""

    name: str = "base"

    @abstractmethod
    async def transcribe(
        self,
        audio_path: str,
        model: Optional[str] = None,
        language: Optional[str] = None,
        **kwargs
    ) -> TranscriptionResult:
        """
        Transcribe audio file to text.

        Args:
            audio_path: Path to audio file (should be 16kHz mono WAV)
            model: Model name/identifier
            language: Language code (e.g., 'en', 'es', 'auto')
            **kwargs: Additional provider-specific options

        Returns:
            TranscriptionResult with transcribed text and metadata
        """
        pass

    @abstractmethod
    async def is_available(self) -> bool:
        """Check if provider is available and properly configured."""
        pass

    def _measure_time(self):
        """Context manager for measuring processing time."""
        return TimeMeasure()


class TimeMeasure:
    """Simple context manager for measuring elapsed time."""

    def __init__(self):
        self.start_time = None
        self.elapsed_ms = 0

    def __enter__(self):
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, *args):
        self.elapsed_ms = int((time.perf_counter() - self.start_time) * 1000)
