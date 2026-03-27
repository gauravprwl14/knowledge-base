"""
Dedup handler — processes DedupCheckMessage messages from kms.dedup queue.

Flow:
  1. Parse the incoming AMQP message body as DedupCheckMessage.
  2. Check Redis cache key ``kms:dedup:sha256:{checksum}`` for a prior file_id.
  3a. Cache HIT  → log the duplicate; stub the kms-api webhook call.
  3b. Cache MISS → record the hash in Redis (TTL 7 days) and in kms_file_duplicates
                   via asyncpg; log "no duplicate found".
  4. Ack the message on success; nack/reject on error according to retryability.
"""

import json

import aio_pika
import asyncpg
import redis.asyncio as aioredis
import structlog

from app.config import get_settings
from app.models.messages import DedupCheckMessage
from app.utils.errors import DatabaseError, HashLookupError, KMSWorkerError

logger = structlog.get_logger(__name__)
settings = get_settings()

_REDIS_KEY_PREFIX = "kms:dedup:sha256:"


class DedupHandler:
    """Consumes DedupCheckMessage from kms.dedup and performs hash-based deduplication.

    Attributes:
        _channel: The aio_pika channel used for publishing downstream messages.
        _redis: Redis async client used as the dedup hash cache.
        _db_pool: asyncpg connection pool for kms_file_duplicates persistence.
    """

    def __init__(
        self,
        channel: aio_pika.Channel,
        redis_client: aioredis.Redis,
        db_pool: asyncpg.Pool,
    ) -> None:
        """Initialise the handler with shared I/O resources.

        Args:
            channel: aio_pika channel (kept for future downstream publishes).
            redis_client: Async Redis client for hash cache operations.
            db_pool: asyncpg connection pool for duplicate record persistence.
        """
        self._channel = channel
        self._redis = redis_client
        self._db_pool = db_pool

    async def handle(self, message: aio_pika.IncomingMessage) -> None:
        """Entry point called by aio_pika for each message delivered on kms.dedup.

        Parses the message body, runs deduplication logic, then acks or nacks the
        message based on the outcome.

        Args:
            message: Raw AMQP message from the kms.dedup queue.
        """
        try:
            payload = json.loads(message.body)
            job = DedupCheckMessage.model_validate(payload)
        except Exception as exc:
            logger.error(
                "Invalid dedup message — dead-lettering",
                error=str(exc),
                body=message.body[:200],
            )
            await message.reject(requeue=False)
            return

        log = logger.bind(
            file_id=job.file_id,
            user_id=job.user_id,
            source_id=job.source_id,
            file_name=job.file_name,
        )
        log.info("Processing dedup check", checksum_prefix=job.checksum_sha256[:16])

        try:
            await self._run_dedup(job, log)
            await message.ack()

        except KMSWorkerError as exc:
            log.error(
                "Dedup check failed",
                code=exc.code,
                retryable=exc.retryable,
                error=str(exc),
            )
            if exc.retryable:
                await message.nack(requeue=True)
            else:
                await message.reject(requeue=False)

        except Exception as exc:
            log.error("Unexpected error during dedup check", error=str(exc))
            await message.nack(requeue=True)

    async def _run_dedup(self, job: DedupCheckMessage, log: structlog.BoundLogger) -> None:
        """Execute the full deduplication check for a single file.

        Checks the Redis cache first; falls back to writing a new entry when the
        file has not been seen before.

        Args:
            job: Validated dedup check message.
            log: Bound structlog logger carrying per-message context fields.

        Raises:
            HashLookupError: When a Redis GET or SET operation fails.
            DatabaseError: When an asyncpg INSERT into kms_file_duplicates fails.
        """
        cache_key = f"{_REDIS_KEY_PREFIX}{job.checksum_sha256}"

        existing_file_id = await self._cache_get(cache_key)

        if existing_file_id is not None:
            log.warning(
                "Duplicate file detected",
                duplicate_of=existing_file_id,
                checksum_prefix=job.checksum_sha256[:16],
            )
            # STUB: call kms-api internal webhook to mark file_id as duplicate.
            # TODO: replace with real HTTP PATCH once kms-api exposes the endpoint.
            await self._notify_duplicate_stub(job, existing_file_id, log)
        else:
            log.info(
                "No duplicate found — recording hash",
                checksum_prefix=job.checksum_sha256[:16],
            )
            await self._cache_set(cache_key, job.file_id)
            await self._persist_dedup_record(job)

    async def _cache_get(self, key: str) -> str | None:
        """Retrieve an existing file_id for a hash key from Redis.

        Args:
            key: Full Redis key (``kms:dedup:sha256:{checksum}``).

        Returns:
            The file_id string stored in Redis, or None when the key is absent.

        Raises:
            HashLookupError: If the Redis GET command raises an exception.
        """
        try:
            value = await self._redis.get(key)
            return value.decode() if value is not None else None
        except Exception as exc:
            raise HashLookupError(
                checksum=key.removeprefix(_REDIS_KEY_PREFIX),
                reason=str(exc),
            ) from exc

    async def _cache_set(self, key: str, file_id: str) -> None:
        """Store a file_id → hash mapping in Redis with a 7-day TTL.

        Args:
            key: Full Redis key (``kms:dedup:sha256:{checksum}``).
            file_id: The file_id to store as the cache value.

        Raises:
            HashLookupError: If the Redis SET command raises an exception.
        """
        try:
            await self._redis.set(key, file_id, ex=settings.redis_ttl_seconds)
        except Exception as exc:
            raise HashLookupError(
                checksum=key.removeprefix(_REDIS_KEY_PREFIX),
                reason=str(exc),
            ) from exc

    async def _persist_dedup_record(self, job: DedupCheckMessage) -> None:
        """Insert a new row into kms_file_duplicates for audit / cross-query purposes.

        Uses an ON CONFLICT DO NOTHING guard so replaying the same message is safe.

        Args:
            job: The validated dedup message whose hash is being persisted.

        Raises:
            DatabaseError: If the asyncpg INSERT fails for any non-conflict reason.
        """
        sql = """
            INSERT INTO kms_file_duplicates (file_id, user_id, source_id, checksum_sha256, file_name, file_size_bytes)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (checksum_sha256) DO NOTHING
        """
        try:
            async with self._db_pool.acquire() as conn:
                await conn.execute(
                    sql,
                    job.file_id,
                    job.user_id,
                    job.source_id,
                    job.checksum_sha256,
                    job.file_name,
                    job.file_size_bytes,
                )
        except Exception as exc:
            raise DatabaseError(operation="insert", reason=str(exc)) from exc

    async def _notify_duplicate_stub(
        self,
        job: DedupCheckMessage,
        existing_file_id: str,
        log: structlog.BoundLogger,
    ) -> None:
        """Stub for the kms-api duplicate notification webhook.

        Logs the would-be webhook payload at INFO level. Replace with an aiohttp
        PATCH call once the kms-api ``/api/v1/files/{id}/duplicate`` endpoint exists.

        Args:
            job: The dedup message for the newly detected duplicate.
            existing_file_id: The file_id of the previously seen original file.
            log: Bound structlog logger carrying per-message context fields.
        """
        log.info(
            "STUB — would notify kms-api of duplicate",
            endpoint=f"{settings.kms_api_url}/api/v1/files/{job.file_id}/duplicate",
            payload={
                "file_id": job.file_id,
                "duplicate_of": existing_file_id,
                "user_id": job.user_id,
                "source_id": job.source_id,
            },
        )
