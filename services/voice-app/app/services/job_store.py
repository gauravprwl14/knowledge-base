"""asyncpg-based data access layer for transcription jobs.

Provides both module-level functions used by the REST API (backed by a shared
connection pool) and the :class:`JobStore` class used by the AMQP worker
(uses per-operation connections for simplicity in a low-throughput consumer).

All database operations use the shared asyncpg connection pool injected at
module level. Never create per-request connections — always use the pool.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import asyncpg
import structlog

from app.models.job import JobStatus, TranscriptionJob
from app.models.messages import VoiceJobMessage

logger = structlog.get_logger(__name__)

# Module-level pool reference — set during FastAPI lifespan startup.
_pool: asyncpg.Pool | None = None


def set_pool(pool: asyncpg.Pool) -> None:
    """Register the shared asyncpg connection pool.

    Args:
        pool: An open asyncpg connection pool to use for all DB operations.
    """
    global _pool
    _pool = pool


def _get_pool() -> asyncpg.Pool:
    """Return the active pool or raise RuntimeError if not initialised.

    Returns:
        The active asyncpg.Pool.

    Raises:
        RuntimeError: If :func:`set_pool` has not been called yet.
    """
    if _pool is None:
        raise RuntimeError("DB pool not initialised — call set_pool() first")
    return _pool


def _row_to_job(row: asyncpg.Record) -> TranscriptionJob:
    """Convert an asyncpg Record to a :class:`~app.models.job.TranscriptionJob`.

    Args:
        row: A single asyncpg Record from the ``voice_jobs`` table.

    Returns:
        A populated TranscriptionJob instance.
    """
    return TranscriptionJob(
        id=row["id"],
        user_id=row["user_id"],
        source_id=row["source_id"],
        file_path=row["file_path"],
        original_filename=row["original_filename"],
        mime_type=row["mime_type"],
        status=row["status"],
        transcript=row["transcript"],
        language=row["language"],
        duration_seconds=row["duration_seconds"],
        error_msg=row["error_msg"],
        model_used=row["model_used"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        completed_at=row["completed_at"],
    )


async def create_job(
    *,
    user_id: uuid.UUID,
    source_id: uuid.UUID | None,
    file_path: str,
    original_filename: str,
    mime_type: str,
    language: str | None,
    model: str,
) -> uuid.UUID:
    """Insert a new PENDING transcription job and return its UUID.

    Args:
        user_id: Owning user's UUID.
        source_id: Optional KMS source UUID.
        file_path: Server-side path to the audio/video file.
        original_filename: Original filename as provided by the client.
        mime_type: MIME type of the file.
        language: BCP-47 language hint, or ``None`` for auto-detect.
        model: Whisper model size (e.g. ``"base"``).

    Returns:
        The UUID of the newly created job.
    """
    pool = _get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO voice_jobs (
            user_id, source_id, file_path, original_filename,
            mime_type, language, model_used, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
        RETURNING id
        """,
        user_id,
        source_id,
        file_path,
        original_filename,
        mime_type,
        language,
        model,
    )
    job_id: uuid.UUID = row["id"]
    logger.info("Job created", job_id=str(job_id))
    return job_id


async def get_job(job_id: uuid.UUID) -> TranscriptionJob | None:
    """Fetch a single transcription job by its UUID.

    Args:
        job_id: UUID of the job to retrieve.

    Returns:
        A :class:`~app.models.job.TranscriptionJob` if found, otherwise ``None``.
    """
    pool = _get_pool()
    row = await pool.fetchrow("SELECT * FROM voice_jobs WHERE id = $1", job_id)
    if row is None:
        return None
    return _row_to_job(row)


async def list_jobs(
    *,
    user_id: uuid.UUID,
    status: JobStatus | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[TranscriptionJob], int]:
    """Return a paginated list of jobs for a user, plus the total count.

    Args:
        user_id: Filter jobs by this user UUID.
        status: Optional status filter (``PENDING``, ``PROCESSING``, etc.).
        limit: Maximum number of records to return.
        offset: Number of records to skip.

    Returns:
        A tuple of ``(jobs, total)`` where ``total`` is the unfiltered count.
    """
    pool = _get_pool()

    params: list[Any] = [user_id]
    where = "WHERE user_id = $1"
    if status:
        params.append(status)
        where += f" AND status = ${len(params)}"

    rows = await pool.fetch(
        f"SELECT * FROM voice_jobs {where} ORDER BY created_at DESC LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}",
        *params,
        limit,
        offset,
    )
    total_row = await pool.fetchrow(
        f"SELECT COUNT(*) AS cnt FROM voice_jobs {where}",
        *params,
    )
    total: int = total_row["cnt"]
    return [_row_to_job(r) for r in rows], total


async def update_job_status(
    job_id: uuid.UUID,
    status: JobStatus,
    *,
    transcript: str | None = None,
    language: str | None = None,
    duration_seconds: float | None = None,
    error_msg: str | None = None,
) -> None:
    """Update the status and optional result fields of a transcription job.

    Sets ``updated_at`` to now. Sets ``completed_at`` to now when ``status``
    is ``COMPLETED`` or ``FAILED``.

    Args:
        job_id: UUID of the job to update.
        status: New status value.
        transcript: Transcribed text (set when ``COMPLETED``).
        language: Detected language code (set when ``COMPLETED``).
        duration_seconds: Audio duration (set when ``COMPLETED``).
        error_msg: Human-readable error (set when ``FAILED``).
    """
    pool = _get_pool()
    now = datetime.now(tz=timezone.utc)
    completed_at = now if status in ("COMPLETED", "FAILED") else None

    await pool.execute(
        """
        UPDATE voice_jobs SET
            status = $1,
            transcript = COALESCE($2, transcript),
            language = COALESCE($3, language),
            duration_seconds = COALESCE($4, duration_seconds),
            error_msg = COALESCE($5, error_msg),
            updated_at = $6,
            completed_at = COALESCE($7, completed_at)
        WHERE id = $8
        """,
        status,
        transcript,
        language,
        duration_seconds,
        error_msg,
        now,
        completed_at,
        job_id,
    )
    logger.info("Job status updated", job_id=str(job_id), status=status)


async def claim_pending_jobs(limit: int = 2) -> list[TranscriptionJob]:
    """Atomically mark up to ``limit`` PENDING jobs as PROCESSING and return them.

    Uses a SELECT ... FOR UPDATE SKIP LOCKED pattern to avoid race conditions
    when multiple consumers run concurrently.

    Args:
        limit: Maximum number of jobs to claim in one pass.

    Returns:
        List of jobs now in PROCESSING state.
    """
    pool = _get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            rows = await conn.fetch(
                """
                SELECT * FROM voice_jobs
                WHERE status = 'PENDING'
                ORDER BY created_at ASC
                LIMIT $1
                FOR UPDATE SKIP LOCKED
                """,
                limit,
            )
            if not rows:
                return []

            ids = [r["id"] for r in rows]
            now = datetime.now(tz=timezone.utc)
            await conn.execute(
                "UPDATE voice_jobs SET status = 'PROCESSING', updated_at = $1 WHERE id = ANY($2)",
                now,
                ids,
            )
            return [_row_to_job(r) for r in rows]


# ---------------------------------------------------------------------------
# AMQP worker: per-operation connection JobStore class
# ---------------------------------------------------------------------------

_VOICE_TABLE = "kms_voice_jobs"


class JobStore:
    """Persists voice job status to ``kms_voice_jobs`` via asyncpg.

    Uses a new connection per operation rather than a pool.  This is
    appropriate for the low-throughput AMQP consumer pattern.  All methods
    handle a missing ``kms_voice_jobs`` table gracefully by logging a warning
    and returning without raising so the worker can continue processing.
    """

    async def _connect(self) -> asyncpg.Connection:
        """Open a raw asyncpg connection using the configured DATABASE_URL.

        Returns:
            An open asyncpg.Connection.
        """
        from app.config import get_settings

        return await asyncpg.connect(get_settings().database_url)

    async def update_status(
        self,
        job_id: str,
        status: str,
        transcript: str | None = None,
        error_msg: str | None = None,
    ) -> None:
        """Update the status of a job row, setting timestamps appropriately.

        Sets ``started_at`` when transitioning to ``RUNNING`` and
        ``finished_at`` when transitioning to ``COMPLETED`` or ``FAILED``.

        Args:
            job_id: UUID string of the job to update.
            status: New status value — ``RUNNING``, ``COMPLETED``, or
                ``FAILED``.
            transcript: Transcribed text; written only on ``COMPLETED``.
            error_msg: Error description; written only on ``FAILED``.
        """
        now = datetime.now(tz=timezone.utc)
        log = logger.bind(job_id=job_id, new_status=status)

        set_clauses: list[str] = ["status = $2", "updated_at = $3"]
        params: list[Any] = [job_id, status, now]

        if status == "RUNNING":
            set_clauses.append(f"started_at = ${len(params) + 1}")
            params.append(now)
        if status in ("COMPLETED", "FAILED"):
            set_clauses.append(f"finished_at = ${len(params) + 1}")
            params.append(now)
        if transcript is not None:
            set_clauses.append(f"transcript = ${len(params) + 1}")
            params.append(transcript)
        if error_msg is not None:
            set_clauses.append(f"error_msg = ${len(params) + 1}")
            params.append(error_msg)

        sql = (
            f"UPDATE {_VOICE_TABLE} SET {', '.join(set_clauses)} WHERE id = $1"
        )

        try:
            conn = await self._connect()
            try:
                await conn.execute(sql, *params)
                log.info("amqp_job_status_updated")
            finally:
                await conn.close()
        except asyncpg.UndefinedTableError:
            log.warning(
                "amqp_job_store_table_missing",
                table=_VOICE_TABLE,
                hint="Run Prisma migrations to create kms_voice_jobs.",
            )
        except Exception as exc:
            log.exception("amqp_job_status_update_failed", error=str(exc))

    async def create_job_if_missing(self, msg: VoiceJobMessage) -> None:
        """Idempotently insert a job row into ``kms_voice_jobs``.

        Uses ``ON CONFLICT (id) DO NOTHING`` so it is safe to call even when
        the REST API has already created the row.

        Args:
            msg: The ``VoiceJobMessage`` whose ``job_id`` is used as the PK.
        """
        log = logger.bind(job_id=str(msg.job_id))

        sql = f"""
            INSERT INTO {_VOICE_TABLE}
                (id, file_id, user_id, source_id, status, language, created_at, updated_at)
            VALUES ($1, $2, $3, $4, 'QUEUED', $5, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
        """

        try:
            conn = await self._connect()
            try:
                await conn.execute(
                    sql,
                    str(msg.job_id),
                    str(msg.file_id),
                    str(msg.user_id),
                    str(msg.source_id),
                    msg.language,
                )
                log.info("amqp_job_row_ensured")
            finally:
                await conn.close()
        except asyncpg.UndefinedTableError:
            log.warning(
                "amqp_job_store_table_missing",
                table=_VOICE_TABLE,
                hint="Run Prisma migrations to create kms_voice_jobs.",
            )
        except Exception as exc:
            log.exception("amqp_job_create_failed", error=str(exc))
