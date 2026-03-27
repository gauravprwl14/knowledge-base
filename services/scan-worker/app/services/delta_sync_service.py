"""
Redis-backed delta sync state for Google Drive incremental scans.

Stores two keys per source:

- ``kms:scan:drive_page_token:{sourceId}`` — the Drive Changes API
  ``startPageToken`` to resume from on the next incremental scan.
- ``kms:scan:last_sync:{sourceId}`` — ISO-8601 UTC timestamp of the last
  completed full or incremental scan (used as a fallback filter when the
  page token is absent).

Both keys expire after 30 days of inactivity; if they are absent the caller
falls back to a full scan.
"""
import json
from datetime import datetime, timezone

import redis.asyncio as redis
import structlog

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

# Keys expire after 30 days — long enough to survive weekend gaps but short
# enough to force an eventual full re-sync if a source is idle for a month.
_TOKEN_TTL_SECONDS = 30 * 24 * 3600
_LAST_SYNC_TTL_SECONDS = 30 * 24 * 3600


class DeltaSyncService:
    """Reads and writes Drive Changes API page tokens and last-sync timestamps.

    Uses a lazily-created async Redis client (reuses the same pattern as
    :class:`~app.services.progress_service.ProgressService`).

    All failures are non-fatal — if Redis is unavailable the caller falls back
    to a FULL scan rather than raising.
    """

    def __init__(self) -> None:
        self._redis: redis.Redis | None = None

    def _client(self) -> redis.Redis:
        """Return (and lazily create) the async Redis client.

        Returns:
            Async Redis client decoded to str responses.
        """
        if self._redis is None:
            self._redis = redis.from_url(
                settings.redis_url,
                decode_responses=True,
            )
        return self._redis

    # ------------------------------------------------------------------
    # Drive Changes page token
    # ------------------------------------------------------------------

    async def get_page_token(self, source_id: str) -> str | None:
        """Return the stored Drive Changes ``startPageToken`` for a source.

        Args:
            source_id: UUID string of the Google Drive source.

        Returns:
            The page token string, or ``None`` if not yet stored (triggers
            a full scan on the caller side).
        """
        key = f"kms:scan:drive_page_token:{source_id}"
        try:
            return await self._client().get(key)
        except Exception as exc:
            logger.warning(
                "delta_sync_get_page_token_failed",
                source_id=source_id,
                error=str(exc),
            )
            return None

    async def set_page_token(self, source_id: str, token: str) -> None:
        """Persist the Drive Changes ``startPageToken`` after a successful scan.

        Args:
            source_id: UUID string of the Google Drive source.
            token: The ``newStartPageToken`` returned by the Changes API after
                the incremental listing is exhausted.
        """
        key = f"kms:scan:drive_page_token:{source_id}"
        try:
            await self._client().setex(key, _TOKEN_TTL_SECONDS, token)
            logger.debug(
                "delta_sync_page_token_stored",
                source_id=source_id,
                token_prefix=token[:8],
            )
        except Exception as exc:
            logger.warning(
                "delta_sync_set_page_token_failed",
                source_id=source_id,
                error=str(exc),
            )

    async def delete_page_token(self, source_id: str) -> None:
        """Remove the stored page token, forcing a full re-sync on the next run.

        Called when a full scan is triggered manually or when the stored token
        is rejected by the Drive API as expired.

        Args:
            source_id: UUID string of the Google Drive source.
        """
        key = f"kms:scan:drive_page_token:{source_id}"
        try:
            await self._client().delete(key)
            logger.info("delta_sync_page_token_cleared", source_id=source_id)
        except Exception as exc:
            logger.warning(
                "delta_sync_delete_page_token_failed",
                source_id=source_id,
                error=str(exc),
            )

    # ------------------------------------------------------------------
    # Last-sync timestamp
    # ------------------------------------------------------------------

    async def get_last_sync(self, source_id: str) -> datetime | None:
        """Return the UTC timestamp of the last completed scan.

        Args:
            source_id: UUID string of the Google Drive source.

        Returns:
            Timezone-aware UTC :class:`datetime`, or ``None`` if never synced.
        """
        key = f"kms:scan:last_sync:{source_id}"
        try:
            val = await self._client().get(key)
            if val is None:
                return None
            return datetime.fromisoformat(val)
        except Exception as exc:
            logger.warning(
                "delta_sync_get_last_sync_failed",
                source_id=source_id,
                error=str(exc),
            )
            return None

    async def set_last_sync(self, source_id: str, ts: datetime | None = None) -> None:
        """Record the completion timestamp of a scan.

        Args:
            source_id: UUID string of the Google Drive source.
            ts: UTC datetime to store.  Defaults to ``datetime.now(timezone.utc)``
                when not provided.
        """
        key = f"kms:scan:last_sync:{source_id}"
        stamp = (ts or datetime.now(timezone.utc)).isoformat()
        try:
            await self._client().setex(key, _LAST_SYNC_TTL_SECONDS, stamp)
            logger.debug(
                "delta_sync_last_sync_stored",
                source_id=source_id,
                timestamp=stamp,
            )
        except Exception as exc:
            logger.warning(
                "delta_sync_set_last_sync_failed",
                source_id=source_id,
                error=str(exc),
            )
