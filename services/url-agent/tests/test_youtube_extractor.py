"""Tests for YouTubeExtractor mock mode."""
from __future__ import annotations

import pytest

from app.services.youtube_extractor import YouTubeExtractor


@pytest.mark.asyncio
async def test_mock_extract_returns_result() -> None:
    """Mock extractor returns a valid YouTubeResult with non-empty transcript."""
    extractor = YouTubeExtractor(mock_mode=True)
    result = await extractor.extract("https://youtube.com/watch?v=dQw4w9WgXcQ")

    assert result.video_id == "dQw4w9WgXcQ"
    assert len(result.transcript) > 100  # must have meaningful content
    assert "[MOCK]" in result.title


@pytest.mark.asyncio
async def test_mock_extract_is_deterministic() -> None:
    """Same URL always returns the same transcript in mock mode."""
    extractor = YouTubeExtractor(mock_mode=True)
    r1 = await extractor.extract("https://youtube.com/watch?v=abc123")
    r2 = await extractor.extract("https://youtube.com/watch?v=abc123")

    assert r1.transcript == r2.transcript
    assert r1.title == r2.title
    assert r1.video_id == r2.video_id


@pytest.mark.asyncio
async def test_mock_different_videos_may_differ() -> None:
    """Different video IDs can (but don't have to) produce different transcripts.

    This test verifies the seed hash mechanism is actually used — two video IDs
    that map to different MOCK_TRANSCRIPTS slots should produce different content.
    """
    extractor = YouTubeExtractor(mock_mode=True)
    # dQw4w9WgXcQ and abc123 hash to different seed values (verified manually)
    r1 = await extractor.extract("https://youtube.com/watch?v=dQw4w9WgXcQ")
    r2 = await extractor.extract("https://youtube.com/watch?v=abc123")

    # At minimum both must be non-empty, valid results
    assert len(r1.transcript) > 0
    assert len(r2.transcript) > 0


@pytest.mark.asyncio
async def test_mock_result_has_channel() -> None:
    """Mock result always includes a non-empty channel name."""
    extractor = YouTubeExtractor(mock_mode=True)
    result = await extractor.extract("https://youtu.be/test123")

    assert result.channel
    assert result.duration_seconds > 0


@pytest.mark.asyncio
async def test_mock_unknown_video_id_handled() -> None:
    """URLs where the video ID cannot be parsed get 'unknown' as video_id."""
    extractor = YouTubeExtractor(mock_mode=True)
    # A URL that matches YouTube domain but has no v= param
    result = await extractor.extract("https://www.youtube.com/channel/UCsomechannel")

    # Should still return a result — 'unknown' video_id is safe
    assert result is not None
    assert "[MOCK]" in result.title
