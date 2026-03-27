"""PostgreSQL-backed run store for rag-service.

Persists RAG run state (query, answer, sources, status) in the ``kms_rag_runs``
table using asyncpg.  The table is created on first use via ``CREATE TABLE IF
NOT EXISTS`` so no separate migration is required.

Table schema:
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
    user_id     UUID NOT NULL
    query       TEXT NOT NULL
    answer      TEXT
    sources     JSONB
    status      VARCHAR DEFAULT 'RUNNING'
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    finished_at TIMESTAMP
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, UTC

import asyncpg
import structlog

logger = structlog.get_logger(__name__)

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS kms_rag_runs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL,
    query       TEXT        NOT NULL,
    answer      TEXT,
    sources     JSONB,
    status      VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP
);
"""


class RunStore:
    """asyncpg-backed store for RAG run lifecycle records.

    Creates the ``kms_rag_runs`` table on first initialisation if it does not
    exist. All methods are async and require an open asyncpg pool.

    Attributes:
        _pool: asyncpg connection pool injected at construction time.

    Example:
        store = RunStore(pool)
        await store.ensure_table()
        run_id = await store.create_run("user-uuid", "what is RAG?")
        await store.update_run(run_id, answer="RAG stands for...", sources=[])
    """

    def __init__(self, pool: asyncpg.Pool) -> None:
        """Initialise the store with a shared asyncpg pool.

        Args:
            pool: Open asyncpg connection pool pointing at the KMS database.
        """
        self._pool = pool

    async def ensure_table(self) -> None:
        """Create ``kms_rag_runs`` if it does not already exist.

        Safe to call on every startup — uses ``CREATE TABLE IF NOT EXISTS``.

        Raises:
            asyncpg.PostgresError: If the DDL statement fails.
        """
        async with self._pool.acquire() as conn:
            await conn.execute(_CREATE_TABLE_SQL)
        logger.debug("kms_rag_runs table ensured")

    async def create_run(
        self,
        run_id: str,
        user_id: str,
        query: str,
    ) -> None:
        """Insert a new run record with status ``RUNNING``.

        Args:
            run_id: Caller-supplied UUID string used as the primary key.
            user_id: UUID of the requesting user.
            query: The raw user query text.

        Raises:
            asyncpg.PostgresError: If the INSERT fails.
        """
        sql = """
            INSERT INTO kms_rag_runs (id, user_id, query, status, created_at)
            VALUES ($1::uuid, $2::uuid, $3, 'RUNNING', $4)
        """
        async with self._pool.acquire() as conn:
            await conn.execute(
                sql,
                run_id,
                user_id,
                query,
                datetime.now(UTC),
            )
        logger.info("Run created", run_id=run_id, user_id=user_id)

    async def update_run(
        self,
        run_id: str,
        answer: str,
        sources: list[dict],
    ) -> None:
        """Update a run record with the generated answer and source references.

        Sets status to ``COMPLETED`` and records the finish timestamp.

        Args:
            run_id: UUID string of the run to update.
            answer: Full LLM-generated answer text.
            sources: List of source reference dicts to store as JSONB.

        Raises:
            asyncpg.PostgresError: If the UPDATE fails.
        """
        sql = """
            UPDATE kms_rag_runs
               SET answer      = $2,
                   sources     = $3,
                   status      = 'COMPLETED',
                   finished_at = $4
             WHERE id = $1::uuid
        """
        async with self._pool.acquire() as conn:
            await conn.execute(
                sql,
                run_id,
                answer,
                json.dumps(sources),
                datetime.now(UTC),
            )
        logger.info("Run updated", run_id=run_id, status="COMPLETED")

    async def fail_run(self, run_id: str, reason: str) -> None:
        """Mark a run as FAILED with an error reason stored in the answer column.

        Args:
            run_id: UUID string of the run to mark as failed.
            reason: Short human-readable error description.

        Raises:
            asyncpg.PostgresError: If the UPDATE fails.
        """
        sql = """
            UPDATE kms_rag_runs
               SET status      = 'FAILED',
                   answer      = $2,
                   finished_at = $3
             WHERE id = $1::uuid
        """
        async with self._pool.acquire() as conn:
            await conn.execute(sql, run_id, reason, datetime.now(UTC))
        logger.info("Run marked failed", run_id=run_id)


# ---------------------------------------------------------------------------
# Redis-backed store kept for backward-compat with existing runs endpoint
# ---------------------------------------------------------------------------

import redis.asyncio as aioredis  # noqa: E402

from app.schemas.run import RunResponse, RunStatus, CreateRunRequest  # noqa: E402


class RedisRunStore:
    """Redis-backed run state store — used by the /runs ACP endpoint.

    Stores the full RunResponse JSON in Redis with a 10-minute TTL.

    Attributes:
        TTL_SECONDS: Time-to-live in seconds for each run key.
        KEY_PREFIX: Redis key prefix for all run entries.
    """

    TTL_SECONDS = 600
    KEY_PREFIX = "kms:rag:run:"

    def __init__(self, redis_client: aioredis.Redis) -> None:
        """Initialise with a shared async Redis client.

        Args:
            redis_client: Open aioredis.Redis client instance.
        """
        self._redis = redis_client

    def _key(self, run_id: str) -> str:
        """Build the Redis key for a run.

        Args:
            run_id: UUID string of the run.

        Returns:
            str: Fully-qualified Redis key.
        """
        return f"{self.KEY_PREFIX}{run_id}"

    async def create(self, request: CreateRunRequest) -> RunResponse:
        """Create a new run record in Redis and return it.

        Args:
            request: ACP CreateRunRequest containing input and config.

        Returns:
            RunResponse: Newly created run record with PENDING status.
        """
        run_id = str(uuid.uuid4())
        run = RunResponse(
            run_id=run_id,
            status=RunStatus.PENDING,
            created_at=datetime.now(UTC),
        )
        await self._redis.setex(
            self._key(run_id), self.TTL_SECONDS, run.model_dump_json()
        )
        logger.info("Run created", run_id=run_id, user_id=request.input.user_id)
        return run

    async def get(self, run_id: str) -> RunResponse | None:
        """Fetch a run record from Redis.

        Args:
            run_id: UUID string of the run.

        Returns:
            RunResponse | None: The run record, or None if not found / expired.
        """
        data = await self._redis.get(self._key(run_id))
        if not data:
            return None
        return RunResponse.model_validate_json(data)

    async def update_status(
        self, run_id: str, status: RunStatus, **kwargs
    ) -> None:
        """Update the status (and any extra fields) of a run in Redis.

        Args:
            run_id: UUID string of the run to update.
            status: New RunStatus value.
            **kwargs: Additional fields to set on the RunResponse (e.g. output,
                completed_at, error).
        """
        run = await self.get(run_id)
        if not run:
            return
        run.status = status
        for k, v in kwargs.items():
            setattr(run, k, v)
        await self._redis.setex(
            self._key(run_id), self.TTL_SECONDS, run.model_dump_json()
        )

    async def delete(self, run_id: str) -> bool:
        """Delete a run record from Redis.

        Args:
            run_id: UUID string of the run to delete.

        Returns:
            bool: True when the key existed and was deleted.
        """
        return bool(await self._redis.delete(self._key(run_id)))
