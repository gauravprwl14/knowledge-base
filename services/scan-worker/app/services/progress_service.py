"""
Redis-backed scan progress tracking for the scan worker.

Progress is keyed by source_id and expires after 1 hour.  The kms-api
/sources/:id/scan-status endpoint reads this key to return real-time
progress to the frontend.
"""
import json

import redis.asyncio as redis
import structlog

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

_PROGRESS_TTL_SECONDS = 3600  # 1 hour


class ProgressService:
    """Stores and retrieves scan progress in Redis.

    Uses a lazily-created connection pool so the class can be instantiated
    without an active event loop.
    """

    def __init__(self) -> None:
        self._redis: redis.Redis | None = None

    def _client(self) -> redis.Redis:
        """Return (and lazily create) the Redis client.

        Returns:
            Async Redis client instance.
        """
        if self._redis is None:
            self._redis = redis.from_url(
                settings.redis_url,
                decode_responses=True,
            )
        return self._redis

    async def set_progress(
        self,
        source_id: str,
        status: str,
        files_found: int = 0,
        files_added: int = 0,
        error: str | None = None,
    ) -> None:
        """Write scan progress to Redis.

        Args:
            source_id: UUID string of the source being scanned.
            status: One of RUNNING, COMPLETED, FAILED.
            files_found: Running total of files discovered.
            files_added: Running total of files upserted.
            error: Optional error message on failure.
        """
        key = f"kms:scan:progress:{source_id}"
        payload = json.dumps({
            "status": status,
            "filesFound": files_found,
            "filesAdded": files_added,
            "error": error,
        })
        try:
            await self._client().setex(key, _PROGRESS_TTL_SECONDS, payload)
        except Exception as exc:
            # Progress tracking is non-fatal — log and continue
            logger.warning("progress_write_failed", source_id=source_id, error=str(exc))

    async def get_progress(self, source_id: str) -> dict | None:
        """Read current scan progress from Redis.

        Args:
            source_id: UUID string of the source.

        Returns:
            Progress dict or None if the key does not exist.
        """
        key = f"kms:scan:progress:{source_id}"
        try:
            val = await self._client().get(key)
            return json.loads(val) if val else None
        except Exception as exc:
            logger.warning("progress_read_failed", source_id=source_id, error=str(exc))
            return None

    async def delete_progress(self, source_id: str) -> None:
        """Remove the progress key for a source.

        Args:
            source_id: UUID string of the source.
        """
        key = f"kms:scan:progress:{source_id}"
        try:
            await self._client().delete(key)
        except Exception as exc:
            logger.warning("progress_delete_failed", source_id=source_id, error=str(exc))
