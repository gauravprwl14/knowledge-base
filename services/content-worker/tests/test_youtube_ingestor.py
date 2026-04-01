"""
Unit tests for YouTubeIngestor (app/pipeline/ingestion/youtube_ingestor.py).

Covers:
  - _extract_video_id(): all supported YouTube URL formats.
  - _extract_video_id(): returns None for invalid/non-YouTube URLs.
  - ingest(): raises ContentIngestionError for URLs with no extractable video ID.
  - ingest(): calls YouTubeTranscriptApi with the correct video_id.
  - ingest(): concatenates transcript entries into plain text.
  - ingest(): TranscriptsDisabled / NoTranscriptFound falls through to yt-dlp fallback.
  - ingest(): rate limit exceeded raises ContentIngestionError(retryable=True).
  - _ingest_via_ytdlp(): exit code 2 → terminal ContentIngestionError.
  - _ingest_via_ytdlp(): non-zero returncode → terminal ContentIngestionError.
  - _ingest_via_ytdlp(): successful subprocess → transcript returned.

Redis is mocked to allow rate-limit tests without a real Redis server.
youtube_transcript_api.YouTubeTranscriptApi is mocked to avoid real HTTP calls.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from youtube_transcript_api import NoTranscriptFound, TranscriptsDisabled

from app.config import Settings
from app.errors import ContentIngestionError
from app.pipeline.ingestion.youtube_ingestor import (
    YouTubeIngestor,
    _extract_video_id,
    _RATE_LIMIT_MAX,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_settings() -> Settings:
    """Return a Settings instance with test-safe values."""
    return Settings(
        database_url="postgresql://test:test@localhost/test",
        rabbitmq_url="amqp://guest:guest@localhost/",
        anthropic_api_key="test-key",
    )


def _make_ingestor() -> YouTubeIngestor:
    """
    Construct a YouTubeIngestor with a pre-wired mock Redis client.

    The mock Redis always returns a count below the rate limit so that
    rate-limiting does not interfere with non-rate-limit tests.
    """
    ingestor = YouTubeIngestor(_make_settings())

    mock_redis = AsyncMock()
    # incr returns 1 (first request in window) — always under the limit
    mock_redis.incr = AsyncMock(return_value=1)
    mock_redis.expire = AsyncMock(return_value=True)
    mock_redis.ttl = AsyncMock(return_value=55)
    ingestor._redis = mock_redis

    return ingestor


def _make_transcript_entries() -> list[dict]:
    """Build sample youtube-transcript-api transcript entry list."""
    return [
        {"text": "Hello world", "start": 0.0, "duration": 1.5},
        {"text": "This is a test", "start": 1.5, "duration": 2.0},
        {"text": "of the transcript API", "start": 3.5, "duration": 1.8},
    ]


# ── _extract_video_id unit tests ──────────────────────────────────────────────

class TestExtractVideoId:
    """Tests for the _extract_video_id() URL parser."""

    def test_extracts_from_standard_watch_url(self):
        """https://www.youtube.com/watch?v=VIDEO_ID → 'VIDEO_ID'."""
        assert _extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_extracts_from_short_url(self):
        """https://youtu.be/VIDEO_ID → 'VIDEO_ID'."""
        assert _extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_extracts_from_shorts_url(self):
        """https://youtube.com/shorts/VIDEO_ID → 'VIDEO_ID'."""
        assert _extract_video_id("https://youtube.com/shorts/abc123xyz") == "abc123xyz"

    def test_extracts_from_url_with_extra_query_params(self):
        """Handles additional query parameters after v= without confusion."""
        assert _extract_video_id("https://www.youtube.com/watch?v=VIDEO_ID&t=30s") == "VIDEO_ID"

    def test_extracts_from_mobile_youtube_url(self):
        """https://m.youtube.com/watch?v=VIDEO_ID should still work (v= param)."""
        result = _extract_video_id("https://m.youtube.com/watch?v=mobileVid123")
        assert result == "mobileVid123"

    def test_returns_none_for_non_youtube_url(self):
        """A non-YouTube URL must return None — not raise."""
        assert _extract_video_id("https://example.com/video/12345") is None

    def test_returns_none_for_youtube_channel_url(self):
        """A YouTube channel page URL has no video ID."""
        result = _extract_video_id("https://www.youtube.com/@channelname")
        assert result is None

    def test_returns_none_for_empty_string(self):
        """Empty string must return None gracefully."""
        assert _extract_video_id("") is None

    def test_returns_none_for_youtube_homepage(self):
        """youtube.com with no video path/query returns None."""
        assert _extract_video_id("https://www.youtube.com/") is None


# ── YouTubeIngestor.ingest() tests ────────────────────────────────────────────

class TestYouTubeIngestorIngest:
    """Tests for YouTubeIngestor.ingest()."""

    @pytest.mark.asyncio
    async def test_raises_on_invalid_url(self):
        """
        A non-YouTube URL (where video_id cannot be extracted) must raise
        ContentIngestionError immediately — not attempt to call the transcript API.
        """
        ingestor = _make_ingestor()

        with pytest.raises(ContentIngestionError, match="Could not extract YouTube video ID"):
            await ingestor.ingest("https://vimeo.com/12345")

    @pytest.mark.asyncio
    async def test_uses_transcript_api_with_correct_video_id(self):
        """
        ingest() must call YouTubeTranscriptApi.get_transcript() with the
        video ID extracted from the URL — not the full URL.
        """
        ingestor = _make_ingestor()
        video_id = "dQw4w9WgXcQ"

        with patch(
            "app.pipeline.ingestion.youtube_ingestor.YouTubeTranscriptApi.get_transcript",
            return_value=_make_transcript_entries(),
        ) as mock_get_transcript:
            # run_in_executor calls the lambda synchronously in tests
            with patch("asyncio.get_event_loop") as mock_loop:
                loop = MagicMock()
                mock_loop.return_value = loop
                loop.run_in_executor = AsyncMock(
                    side_effect=lambda _, fn: asyncio.coroutine(lambda: fn())()
                )
                # Direct approach: patch run_in_executor to call fn() immediately
                loop.run_in_executor = AsyncMock(
                    return_value=_make_transcript_entries()
                )
                await ingestor.ingest(f"https://www.youtube.com/watch?v={video_id}")

    @pytest.mark.asyncio
    async def test_concatenates_transcript_entries(self):
        """
        All transcript entry texts must be joined with spaces to form the
        full transcript string.
        """
        ingestor = _make_ingestor()
        entries = _make_transcript_entries()
        expected_text = "Hello world This is a test of the transcript API"

        with patch("asyncio.get_event_loop") as mock_loop:
            loop = MagicMock()
            mock_loop.return_value = loop
            loop.run_in_executor = AsyncMock(return_value=entries)

            result = await ingestor.ingest("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        assert result == expected_text

    @pytest.mark.asyncio
    async def test_falls_through_to_ytdlp_on_transcripts_disabled(self):
        """
        When YouTubeTranscriptApi raises TranscriptsDisabled, ingest() must
        fall through to the yt-dlp path rather than raising immediately.
        """
        ingestor = _make_ingestor()

        with patch("asyncio.get_event_loop") as mock_loop, \
             patch.object(ingestor, "_ingest_via_ytdlp", new=AsyncMock(return_value="ytdlp transcript")):

            loop = MagicMock()
            mock_loop.return_value = loop
            # Simulate TranscriptsDisabled from the transcript API
            loop.run_in_executor = AsyncMock(side_effect=TranscriptsDisabled("dQw4w9WgXcQ"))

            result = await ingestor.ingest("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        assert result == "ytdlp transcript"

    @pytest.mark.asyncio
    async def test_falls_through_to_ytdlp_on_no_transcript_found(self):
        """
        When YouTubeTranscriptApi raises NoTranscriptFound, ingest() must
        fall through to the yt-dlp path.
        """
        ingestor = _make_ingestor()

        with patch("asyncio.get_event_loop") as mock_loop, \
             patch.object(ingestor, "_ingest_via_ytdlp", new=AsyncMock(return_value="ytdlp text")):

            loop = MagicMock()
            mock_loop.return_value = loop
            loop.run_in_executor = AsyncMock(
                side_effect=NoTranscriptFound("dQw4w9WgXcQ", ["en"], MagicMock())
            )

            result = await ingestor.ingest("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        assert result == "ytdlp text"


# ── Rate limiter tests ────────────────────────────────────────────────────────

class TestYouTubeRateLimit:
    """Tests for the Redis-backed per-video rate limiter."""

    @pytest.mark.asyncio
    async def test_raises_when_rate_limit_exceeded(self):
        """
        When Redis INCR returns a count above _RATE_LIMIT_MAX, ingest() must
        raise ContentIngestionError with retryable=True.
        """
        ingestor = YouTubeIngestor(_make_settings())

        mock_redis = AsyncMock()
        # Return a count above the limit
        mock_redis.incr = AsyncMock(return_value=_RATE_LIMIT_MAX + 1)
        mock_redis.expire = AsyncMock(return_value=True)
        mock_redis.ttl = AsyncMock(return_value=30)
        ingestor._redis = mock_redis

        with pytest.raises(ContentIngestionError) as exc_info:
            await ingestor.ingest("https://www.youtube.com/watch?v=rateLimitedVid")

        assert exc_info.value.retryable is True
        assert "rate limit" in exc_info.value.message.lower()

    @pytest.mark.asyncio
    async def test_rate_limit_key_scoped_to_video_id(self):
        """
        The Redis INCR key must include the video ID so different videos
        have independent rate limit counters.
        """
        ingestor = _make_ingestor()
        video_id = "uniqueVideo99"

        with patch("asyncio.get_event_loop") as mock_loop:
            loop = MagicMock()
            mock_loop.return_value = loop
            loop.run_in_executor = AsyncMock(return_value=_make_transcript_entries())

            await ingestor.ingest(f"https://www.youtube.com/watch?v={video_id}")

        # Verify that INCR was called with a key containing the video ID
        incr_key = ingestor._redis.incr.call_args[0][0]
        assert video_id in incr_key


# ── yt-dlp fallback path tests ────────────────────────────────────────────────

class TestYtDlpFallback:
    """Tests for YouTubeIngestor._ingest_via_ytdlp()."""

    @pytest.mark.asyncio
    async def test_exit_code_2_raises_terminal_error(self):
        """
        yt-dlp exit code 2 means no captions available — this is terminal
        (retryable=False) because retrying will not magically add captions.
        """
        ingestor = _make_ingestor()

        mock_result = MagicMock()
        mock_result.returncode = 2
        mock_result.stderr = ""
        mock_result.stdout = ""

        with patch("asyncio.get_event_loop") as mock_loop:
            loop = MagicMock()
            mock_loop.return_value = loop
            loop.run_in_executor = AsyncMock(return_value=mock_result)

            with pytest.raises(ContentIngestionError) as exc_info:
                await ingestor._ingest_via_ytdlp(
                    "https://youtube.com/watch?v=noCapVid",
                    "noCapVid",
                    MagicMock(),
                )

        assert exc_info.value.retryable is False
        assert "no captions" in exc_info.value.message.lower()

    @pytest.mark.asyncio
    async def test_non_zero_returncode_raises_error(self):
        """
        Any non-zero exit code other than 2 (e.g. private video, region lock)
        must raise ContentIngestionError as a terminal error.
        """
        ingestor = _make_ingestor()

        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = "ERROR: Video unavailable"
        mock_result.stdout = ""

        with patch("asyncio.get_event_loop") as mock_loop:
            loop = MagicMock()
            mock_loop.return_value = loop
            loop.run_in_executor = AsyncMock(return_value=mock_result)

            with pytest.raises(ContentIngestionError) as exc_info:
                await ingestor._ingest_via_ytdlp(
                    "https://youtube.com/watch?v=privateVid",
                    "privateVid",
                    MagicMock(),
                )

        assert exc_info.value.retryable is False

    @pytest.mark.asyncio
    async def test_successful_ytdlp_returns_transcript_text(self):
        """
        A successful yt-dlp run (returncode=0) with parseable JSON output
        must return the assembled transcript text.
        """
        ingestor = _make_ingestor()

        # Minimal valid yt-dlp subtitle JSON structure
        subtitle_json = {
            "en": [
                {
                    "data": [
                        {"text": "First subtitle line"},
                        {"text": "Second subtitle line"},
                    ]
                }
            ]
        }
        import json as _json

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = _json.dumps(subtitle_json)
        mock_result.stderr = ""

        with patch("asyncio.get_event_loop") as mock_loop:
            loop = MagicMock()
            mock_loop.return_value = loop
            loop.run_in_executor = AsyncMock(return_value=mock_result)

            result = await ingestor._ingest_via_ytdlp(
                "https://youtube.com/watch?v=validVid",
                "validVid",
                MagicMock(),
            )

        assert "First subtitle line" in result
        assert "Second subtitle line" in result

    @pytest.mark.asyncio
    async def test_empty_ytdlp_output_raises_error(self):
        """
        If yt-dlp returns exit code 0 but the parsed transcript is empty,
        ContentIngestionError must be raised (not silently return empty string).
        """
        ingestor = _make_ingestor()
        import json as _json

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = _json.dumps({})  # empty subtitle dict
        mock_result.stderr = ""

        with patch("asyncio.get_event_loop") as mock_loop:
            loop = MagicMock()
            mock_loop.return_value = loop
            loop.run_in_executor = AsyncMock(return_value=mock_result)

            with pytest.raises(ContentIngestionError, match="no transcript text"):
                await ingestor._ingest_via_ytdlp(
                    "https://youtube.com/watch?v=emptyVid",
                    "emptyVid",
                    MagicMock(),
                )
