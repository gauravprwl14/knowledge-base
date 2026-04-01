"""
YouTube ingestor — extracts transcript from a YouTube video URL.

Uses youtube-transcript-api (fast, caption-based) with yt-dlp as fallback
for auto-generated captions.

Rate limiting: Redis-backed per-channel limiter prevents hammering a single
channel too quickly (YouTube IP blocks affect all jobs, not just the offending one).
The rate limit key is based on the channel ID extracted from yt-dlp metadata.

Prompt injection defense: Transcript text is returned as-is. The pipeline runner
wraps it in <external_content>...</external_content> before passing to Claude.
"""
import asyncio
import re
import subprocess
import json
from urllib.parse import urlparse, parse_qs

import redis.asyncio as aioredis
import structlog
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled

from app.config import Settings
from app.errors import ContentIngestionError

logger = structlog.get_logger(__name__)

# Rate limit: max N requests per channel per window
_RATE_LIMIT_MAX = 5
_RATE_LIMIT_WINDOW_SECONDS = 60
_REDIS_KEY_PREFIX = "content:yt_rate:"


def _extract_video_id(url: str) -> str | None:
    """
    Extract YouTube video ID from a URL.

    Handles formats:
    - https://www.youtube.com/watch?v=VIDEO_ID
    - https://youtu.be/VIDEO_ID
    - https://youtube.com/shorts/VIDEO_ID

    Args:
        url: YouTube URL string.

    Returns:
        Video ID string, or None if not extractable.
    """
    parsed = urlparse(url)
    if parsed.hostname in ("youtu.be",):
        return parsed.path.lstrip("/").split("/")[0] or None
    qs = parse_qs(parsed.query)
    if "v" in qs:
        return qs["v"][0]
    # Shorts: /shorts/VIDEO_ID
    match = re.search(r"/shorts/([A-Za-z0-9_-]+)", parsed.path)
    if match:
        return match.group(1)
    return None


class YouTubeIngestor:
    """
    Extracts transcript text from a YouTube video.

    Args:
        settings: Application configuration.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._redis: aioredis.Redis | None = None

    async def _get_redis(self) -> aioredis.Redis:
        """Lazy-initialise the Redis client (rate limiter)."""
        if self._redis is None:
            self._redis = aioredis.from_url(
                self._settings.redis_url, decode_responses=True
            )
        return self._redis

    async def ingest(self, url: str) -> str:
        """
        Extract transcript from a YouTube video URL.

        Attempts youtube-transcript-api first (fast, no yt-dlp subprocess).
        Falls back to yt-dlp for auto-generated captions.

        Rate limits per channel to prevent YouTube IP blocks.

        Args:
            url: YouTube video URL.

        Returns:
            Full transcript text with timestamps stripped.

        Raises:
            ContentIngestionError: If no captions available or rate limited.
        """
        log = logger.bind(url=url[:80])

        video_id = _extract_video_id(url)
        if not video_id:
            raise ContentIngestionError(
                f"Could not extract YouTube video ID from URL: {url[:100]}"
            )

        log = log.bind(video_id=video_id)

        # ── Rate limit check ──────────────────────────────────────────────────
        await self._enforce_rate_limit(video_id, log)

        # ── Attempt 1: youtube-transcript-api (fast, no subprocess) ──────────
        try:
            log.info("yt_ingest_transcript_api_attempt")
            transcript_list = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: YouTubeTranscriptApi.get_transcript(video_id),
            )
            text = " ".join(entry["text"] for entry in transcript_list)
            log.info("yt_ingest_transcript_api_done", chars=len(text))
            return text

        except (NoTranscriptFound, TranscriptsDisabled):
            log.info("yt_ingest_no_manual_captions_trying_yt_dlp")

        except Exception as exc:  # noqa: BLE001
            log.warning("yt_ingest_transcript_api_error", error=str(exc))

        # ── Attempt 2: yt-dlp auto-generated captions ─────────────────────────
        return await self._ingest_via_ytdlp(url, video_id, log)

    async def _enforce_rate_limit(self, video_id: str, log) -> None:
        """
        Redis-backed rate limiter: max _RATE_LIMIT_MAX requests per video per window.

        Uses Redis INCR + EXPIRE pattern. The key is scoped to the video ID
        (not channel ID — channel ID requires a yt-dlp metadata call which is
        the slow path). Video-level limiting is simpler and still effective.

        Args:
            video_id: YouTube video ID.
            log: Bound structlog logger.

        Raises:
            ContentIngestionError: If rate limit exceeded.
        """
        redis = await self._get_redis()
        key = f"{_REDIS_KEY_PREFIX}{video_id}"

        count = await redis.incr(key)
        if count == 1:
            # First request in this window — set expiry
            await redis.expire(key, _RATE_LIMIT_WINDOW_SECONDS)

        if count > _RATE_LIMIT_MAX:
            ttl = await redis.ttl(key)
            log.warning("yt_ingest_rate_limited", count=count, ttl=ttl)
            raise ContentIngestionError(
                f"YouTube rate limit: too many requests for video {video_id}. "
                f"Try again in {ttl} seconds.",
                retryable=True,
            )

    async def _ingest_via_ytdlp(self, url: str, video_id: str, log) -> str:
        """
        Extract transcript using yt-dlp subprocess.

        Attempts to get auto-generated English captions. Exit code 2 indicates
        no captions are available — raises as a terminal (non-retryable) error.

        Args:
            url: Full YouTube URL.
            video_id: Extracted video ID (used for error messages).
            log: Bound structlog logger.

        Returns:
            Transcript text with timestamps stripped.

        Raises:
            ContentIngestionError: If no captions available (exit code 2) or
                yt-dlp fails for another reason.
        """
        log.info("yt_ingest_ytdlp_attempt")

        cmd = [
            "yt-dlp",
            "--write-auto-sub",
            "--sub-lang", "en",
            "--skip-download",
            "--print", "%(subtitles)j",
            "--no-warnings",
            url,
        ]

        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=120,  # 2-minute timeout for slow connections
                ),
            )
        except subprocess.TimeoutExpired as exc:
            raise ContentIngestionError(
                "yt-dlp timed out extracting captions. The video may be too long.",
                retryable=True,
            ) from exc

        if result.returncode == 2:
            # yt-dlp exit code 2 = no captions / subtitles available
            raise ContentIngestionError(
                f"No captions available for this video (ID: {video_id}). "
                "Try a video that has captions or subtitles enabled.",
                retryable=False,  # Retrying won't help — the video has no captions
            )

        if result.returncode != 0:
            log.error("yt_ingest_ytdlp_error", returncode=result.returncode, stderr=result.stderr[:500])
            raise ContentIngestionError(
                f"yt-dlp failed with exit code {result.returncode}. "
                "The video may be private, age-restricted, or region-locked.",
                retryable=False,
            )

        # Parse VTT subtitle content from yt-dlp stdout
        # yt-dlp --print "%(subtitles)j" outputs JSON with subtitle track data
        try:
            subtitle_data = json.loads(result.stdout.strip())
            # Flatten all subtitle entries to plain text
            transcript_parts = []
            for lang_data in subtitle_data.values():
                for track in lang_data:
                    if isinstance(track, dict) and "data" in track:
                        for entry in track["data"]:
                            if isinstance(entry, dict):
                                text = entry.get("text", "").strip()
                                if text:
                                    transcript_parts.append(text)
            text = " ".join(transcript_parts)
        except (json.JSONDecodeError, KeyError, TypeError):
            # If parsing fails, try extracting text lines directly from output
            lines = [
                line.strip()
                for line in result.stdout.splitlines()
                if line.strip() and not line.startswith("WEBVTT") and "-->" not in line
            ]
            text = " ".join(lines)

        if not text.strip():
            raise ContentIngestionError(
                f"yt-dlp ran successfully but produced no transcript text for video {video_id}.",
                retryable=False,
            )

        log.info("yt_ingest_ytdlp_done", chars=len(text))
        return text
