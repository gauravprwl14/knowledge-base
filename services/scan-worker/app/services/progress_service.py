"""
Redis-backed scan progress tracking for the scan worker.

Progress is keyed by ``kms:scan:progress:{source_id}`` and expires after 1 hour.
The kms-api ``/sources/:id/scan-status`` endpoint reads this key to return
real-time progress to the frontend.

Schema stored in Redis (JSON):

.. code-block:: json

    {
        "status": "running",
        "discovered": 42,
        "indexed": 38,
        "failed": 1,
        "error": null
    }

``status`` is one of: ``"running"`` | ``"complete"`` | ``"failed"``.
"""
import json

import redis.asyncio as redis
import structlog

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

_PROGRESS_TTL_SECONDS = 3600  # 1 hour

# Status string constants — lower-case to match the API contract
STATUS_RUNNING = "running"
STATUS_COMPLETE = "complete"
STATUS_FAILED = "failed"


class ProgressService:
    """Stores and retrieves scan progress in Redis.

    Uses a lazily-created async Redis client so the class can be instantiated
    without an active event loop.

    The ``set_progress`` method accepts a superset of counters:
    ``discovered`` (files found by the connector), ``indexed`` (files
    successfully queued for embedding), and ``failed`` (files that could not be
    processed).  Legacy ``files_found`` / ``files_added`` keyword arguments are
    accepted for backward compatibility but map to ``discovered`` / ``indexed``.
    """

    def __init__(self) -> None:
        self._redis: redis.Redis | None = None

    def _client(self) -> redis.Redis:
        """Return (and lazily create) the async Redis client.

        Returns:
            Async Redis client with decoded string responses.
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
        *,
        discovered: int = 0,
        indexed: int = 0,
        failed: int = 0,
        # Legacy aliases kept for backward compatibility with existing call sites
        files_found: int = 0,
        files_added: int = 0,
        error: str | None = None,
    ) -> None:
        """Write scan progress to Redis.

        Args:
            source_id: UUID string of the source being scanned.
            status: One of ``"running"``, ``"complete"``, or ``"failed"``.
                Callers may also pass the legacy upper-case variants
                (``"RUNNING"``, ``"COMPLETED"``, ``"FAILED""``) which are
                normalised automatically.
            discovered: Total files found by the connector so far.
            indexed: Total files successfully queued for embedding.
            failed: Total files that could not be processed.
            files_found: Deprecated alias for ``discovered``.
            files_added: Deprecated alias for ``indexed``.
            error: Optional error message on failure.
        """
        # Normalise legacy upper-case status strings
        normalised = status.lower()
        if normalised == "completed":
            normalised = STATUS_COMPLETE

        # Legacy callers pass files_found / files_added; prefer explicit args
        effective_discovered = discovered or files_found
        effective_indexed = indexed or files_added

        key = f"kms:scan:progress:{source_id}"
        payload = json.dumps({
            "status": normalised,
            "discovered": effective_discovered,
            "indexed": effective_indexed,
            "failed": failed,
            # Legacy fields retained so existing API consumers don't break
            "filesFound": effective_discovered,
            "filesAdded": effective_indexed,
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
            Progress dict, or ``None`` if the key does not exist.
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
