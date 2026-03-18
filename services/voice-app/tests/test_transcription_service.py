"""Tests for TranscriptionService.

All Whisper model calls are mocked — no GPU or model weights required.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.services.transcription_service import TranscriptionService, TranscriptResult
from app.utils.errors import TranscriptionError

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_segment(text: str, end: float) -> SimpleNamespace:
    """Create a fake Whisper segment with text and end timestamp."""
    return SimpleNamespace(text=text, end=end)


def _make_info(language: str = "en") -> SimpleNamespace:
    """Create a fake Whisper TranscriptionInfo with a language attribute."""
    return SimpleNamespace(language=language)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_transcribe_returns_transcript_and_language(tmp_path) -> None:
    """TranscriptionService.transcribe() returns text, language, and duration."""
    audio_file = tmp_path / "meeting.mp3"
    audio_file.write_bytes(b"fake audio data")

    segments = [_make_segment("Hello ", 1.5), _make_segment("world", 3.0)]
    info = _make_info(language="en")

    mock_model = MagicMock()
    mock_model.transcribe.return_value = (iter(segments), info)

    with patch("faster_whisper.WhisperModel", return_value=mock_model):
        service = TranscriptionService(default_model="base")
        # Bypass lazy load by injecting mock directly
        service._models["base"] = mock_model

        import asyncio

        result = asyncio.get_event_loop().run_until_complete(
            service.transcribe(str(audio_file), language=None, model="base")
        )

    assert isinstance(result, TranscriptResult)
    assert "Hello" in result.text
    assert "world" in result.text
    assert result.language == "en"
    assert result.duration_seconds == pytest.approx(3.0)


def test_transcribe_missing_file_raises_transcription_error() -> None:
    """TranscriptionService.transcribe() raises TranscriptionError for missing files."""
    service = TranscriptionService(default_model="base")

    import asyncio

    with pytest.raises(TranscriptionError) as exc_info:
        asyncio.get_event_loop().run_until_complete(
            service.transcribe("/nonexistent/path/audio.mp3", language=None, model="base")
        )

    assert exc_info.value.retryable is False
    assert exc_info.value.code == "KBWRK0002"


def test_transcribe_lazy_loads_model_once() -> None:
    """WhisperModel is instantiated only once across multiple transcribe calls."""
    import tempfile
    import os

    service = TranscriptionService(default_model="base")

    segments = [_make_segment("Hello", 1.0)]
    info = _make_info("en")

    mock_model = MagicMock()
    mock_model.transcribe.return_value = (iter(segments), info)

    call_count = 0

    def fake_whisper_model(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return mock_model

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        f.write(b"fake")
        tmp_path = f.name

    try:
        with patch("faster_whisper.WhisperModel", side_effect=fake_whisper_model):
            import asyncio

            loop = asyncio.get_event_loop()

            # Reset model segments each call since iterators are consumed
            mock_model.transcribe.return_value = (iter([_make_segment("Hello", 1.0)]), info)
            loop.run_until_complete(service.transcribe(tmp_path, language=None, model="base"))

            mock_model.transcribe.return_value = (iter([_make_segment("World", 2.0)]), info)
            loop.run_until_complete(service.transcribe(tmp_path, language=None, model="base"))

        assert call_count == 1, f"Expected model to be loaded once, got {call_count}"
    finally:
        os.unlink(tmp_path)
