# NOTE: kms_files requires a UNIQUE constraint on (source_id, external_id)
# for the ON CONFLICT upsert to work. This is added by the files-module agent
# in the Prisma schema migration.
"""
Asyncpg-backed persistence layer for the scan worker.

Handles upserts of discovered files into ``kms_files`` and status updates
for ``kms_scan_jobs``.  Uses raw asyncpg (no ORM) as required by the
engineering standards for worker services.
"""
from datetime import datetime, timezone

import asyncpg
import structlog

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()


class FileSyncService:
    """Persists file and scan-job records to PostgreSQL via asyncpg.

    Each public method opens and closes its own connection.  This is
    intentional for worker processes that run long-lived AMQP consumers;
    connection pooling can be added in a later iteration if throughput
    requires it.
    """

    async def upsert_files(
        self,
        files: list[dict],
        source_id: str,
        user_id: str,
    ) -> int:
        """Upsert a batch of discovered files into ``kms_files``.

        Uses ``ON CONFLICT (source_id, external_id)`` to update metadata
        only when ``external_modified_at`` has changed, avoiding spurious
        embed-worker triggers.

        Args:
            files: List of file dicts.  Required keys: ``external_id``,
                ``name``, ``mime_type``.  Optional: ``path``,
                ``size_bytes``, ``web_view_link``, ``external_modified_at``.
            source_id: UUID string of the parent source.
            user_id: UUID string of the owning user.

        Returns:
            Number of rows processed (includes both inserts and updates).
        """
        if not files:
            return 0

        conn: asyncpg.Connection = await asyncpg.connect(settings.database_url)
        try:
            count = 0
            for f in files:
                await conn.execute(
                    """
                    INSERT INTO kms_files (
                        id, user_id, source_id, name, path, mime_type,
                        size_bytes, external_id, web_view_link,
                        external_modified_at, checksum_sha256, status, created_at, updated_at
                    ) VALUES (
                        gen_random_uuid(), $1, $2, $3, $4, $5,
                        $6, $7, $8, $9, $10, 'PENDING', NOW(), NOW()
                    )
                    ON CONFLICT (source_id, external_id) WHERE external_id IS NOT NULL DO UPDATE SET
                        name                 = EXCLUDED.name,
                        path                 = EXCLUDED.path,
                        mime_type            = EXCLUDED.mime_type,
                        size_bytes           = EXCLUDED.size_bytes,
                        web_view_link        = EXCLUDED.web_view_link,
                        external_modified_at = EXCLUDED.external_modified_at,
                        checksum_sha256      = EXCLUDED.checksum_sha256,
                        updated_at           = NOW()
                    WHERE kms_files.external_modified_at IS DISTINCT FROM EXCLUDED.external_modified_at
                       OR kms_files.checksum_sha256 IS DISTINCT FROM EXCLUDED.checksum_sha256
                    """,
                    user_id,
                    source_id,
                    f["name"],
                    f.get("path", f["name"]),
                    f["mime_type"],
                    f.get("size_bytes") or 0,
                    f["external_id"],
                    f.get("web_view_link"),
                    # Strip timezone info for TIMESTAMP WITHOUT TIME ZONE column
                    (f["external_modified_at"].replace(tzinfo=None)
                     if isinstance(f.get("external_modified_at"), datetime) else f.get("external_modified_at")),
                    f.get("checksum_sha256"),
                )
                count += 1

            logger.debug("files_upserted", source_id=source_id, count=count)
            return count
        finally:
            await conn.close()

    async def update_scan_job(
        self,
        scan_job_id: str,
        status: str,
        files_found: int = 0,
        files_added: int = 0,
        error_msg: str | None = None,
    ) -> None:
        """Update scan job status and counters in ``kms_scan_jobs``.

        Sets ``finished_at`` when transitioning to a terminal status and
        ``started_at`` on the first RUNNING update.

        Args:
            scan_job_id: UUID string of the scan job.
            status: Target status (RUNNING, COMPLETED, FAILED, CANCELLED).
            files_found: Total files discovered so far.
            files_added: Total files upserted so far.
            error_msg: Optional error message on failure.
        """
        conn: asyncpg.Connection = await asyncpg.connect(settings.database_url)
        try:
            # Cast $1 to text explicitly to avoid enum vs text type ambiguity in asyncpg
            await conn.execute(
                """
                UPDATE kms_scan_jobs
                SET
                    status      = $1::"ScanJobStatus",
                    files_found = $2,
                    files_added = $3,
                    error_msg   = $4,
                    finished_at = CASE
                        WHEN $6 IN ('COMPLETED', 'FAILED', 'CANCELLED') THEN NOW()
                        ELSE finished_at
                    END,
                    started_at  = CASE
                        WHEN $6 = 'RUNNING' AND started_at IS NULL THEN NOW()
                        ELSE started_at
                    END,
                    updated_at  = NOW()
                WHERE id = $5
                """,
                status,
                files_found,
                files_added,
                error_msg,
                scan_job_id,
                status,  # $6: text copy used in CASE comparisons
            )
            logger.debug("scan_job_updated", scan_job_id=scan_job_id, status=status)
        finally:
            await conn.close()

    async def get_existing_files(self, source_id: str) -> list[dict]:
        """Fetch existing file records for incremental change detection.

        Returns a list of dicts with ``external_id``, ``checksum_sha256``,
        and ``external_modified_at`` for all files belonging to the source.
        Only rows where ``external_id IS NOT NULL`` are returned, as local
        connectors rely on the relative path as a stable key.

        Args:
            source_id: UUID string of the source being scanned.

        Returns:
            List of row dicts suitable for building an ``external_id`` lookup map.
        """
        conn: asyncpg.Connection = await asyncpg.connect(settings.database_url)
        try:
            rows = await conn.fetch(
                """
                SELECT external_id, checksum_sha256, external_modified_at
                FROM kms_files
                WHERE source_id = $1 AND external_id IS NOT NULL
                """,
                source_id,
            )
            return [dict(r) for r in rows]
        finally:
            await conn.close()

    async def get_source_tokens(self, source_id: str) -> str | None:
        """Read the encrypted OAuth2 token blob directly from ``kms_sources``.

        The token encryption/decryption is handled by the connector layer.

        Args:
            source_id: UUID string of the source.

        Returns:
            Base64-encoded encrypted token string, or None if not found.
        """
        conn: asyncpg.Connection = await asyncpg.connect(settings.database_url)
        try:
            row = await conn.fetchrow(
                "SELECT encrypted_tokens FROM kms_sources WHERE id = $1",
                source_id,
            )
            return row["encrypted_tokens"] if row else None
        finally:
            await conn.close()
