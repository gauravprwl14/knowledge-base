# NOTE: kms_files requires a UNIQUE constraint on (source_id, external_id)
# for the ON CONFLICT upsert to work. This is added by the files-module agent
# in the Prisma schema migration.
"""
Asyncpg-backed persistence layer for the scan worker.

Handles upserts of discovered files into ``kms_files``, status updates for
``kms_scan_jobs``, and queries to determine which files need embed-pipeline
publishing after a scan.  Uses raw asyncpg (no ORM) as required by the
engineering standards for worker services.
"""
from datetime import datetime, timezone

import asyncpg
import structlog

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

# File statuses that indicate the file is already fully indexed and unchanged.
# Files in these states are NOT re-published to the embed queue.
_ALREADY_INDEXED_STATUSES = ("INDEXED",)


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

    async def get_files_pending_embed(
        self,
        source_id: str,
        external_ids: list[str],
    ) -> list[dict]:
        """Return file rows that should be published to the embed queue.

        Filters the given ``external_ids`` to those whose DB record exists,
        is **not** in status ``INDEXED`` with an unchanged checksum, and is
        **not** in status ``UNSUPPORTED``.

        This is used by the scan handler after a batch upsert to determine
        which files actually need to be sent down the embedding pipeline.

        Args:
            source_id: UUID string of the parent source.
            external_ids: List of Drive file IDs (or local paths) that were
                just upserted.

        Returns:
            List of dicts with keys ``id``, ``external_id``, ``mime_type``,
            ``status``, ``checksum_sha256`` for each file that needs embedding.
        """
        if not external_ids:
            return []

        conn: asyncpg.Connection = await asyncpg.connect(settings.database_url)
        try:
            rows = await conn.fetch(
                """
                SELECT id, external_id, name, path, mime_type, size_bytes, status::text AS status, checksum_sha256
                FROM kms_files
                WHERE source_id = $1
                  AND external_id = ANY($2::text[])
                  AND status::text NOT IN ('UNSUPPORTED', 'INDEXED')
                """,
                source_id,
                external_ids,
            )
            return [dict(r) for r in rows]
        finally:
            await conn.close()

    async def get_file_by_external_id(
        self,
        source_id: str,
        external_id: str,
    ) -> dict | None:
        """Fetch a single file record by its external identifier.

        Args:
            source_id: UUID string of the parent source.
            external_id: The stable external key (Drive file ID or local path).

        Returns:
            Dict with ``id``, ``external_id``, ``mime_type``, ``status``,
            ``checksum_sha256``, or ``None`` if no matching row exists.
        """
        conn: asyncpg.Connection = await asyncpg.connect(settings.database_url)
        try:
            row = await conn.fetchrow(
                """
                SELECT id, external_id, mime_type, status::text AS status, checksum_sha256
                FROM kms_files
                WHERE source_id = $1 AND external_id = $2
                """,
                source_id,
                external_id,
            )
            return dict(row) if row else None
        finally:
            await conn.close()

    async def handle_file_deleted(
        self,
        external_file_id: str,
        source_id: str,
        user_id: str,
    ) -> str | None:
        """Soft-delete a file that was removed from the source.

        Looks up ``kms_files`` by ``external_id`` and ``source_id``, deletes
        all associated ``kms_chunks`` rows, then sets the file status to
        ``DELETED`` with a ``deleted_at`` timestamp.

        Qdrant point cleanup is deferred — the reset/clear flow handles orphaned
        vectors in a background pass (tracked in backlog).

        Args:
            external_file_id: The Drive file ID (or other source-native key).
            source_id: UUID string of the parent source.
            user_id: UUID string of the owning user (for log context).

        Returns:
            The ``kms_files.id`` UUID string of the soft-deleted row, or
            ``None`` when no matching row was found (already deleted or never
            indexed).
        """
        log = logger.bind(
            external_id=external_file_id,
            source_id=source_id,
            user_id=user_id,
        )

        conn: asyncpg.Connection = await asyncpg.connect(settings.database_url)
        try:
            # Look up the kms_files row by external_id + source_id
            row = await conn.fetchrow(
                """
                SELECT id
                FROM kms_files
                WHERE source_id = $1::uuid AND external_id = $2
                  AND status::text != 'DELETED'
                """,
                source_id,
                external_file_id,
            )

            if not row:
                log.debug(
                    "removed_file_not_found_in_kms_files",
                    detail="already deleted or never indexed",
                )
                return None

            file_id = str(row["id"])

            # Delete orphaned chunk rows first (FK constraint: chunks ref files)
            deleted_chunks = await conn.fetchval(
                """
                WITH deleted AS (
                    DELETE FROM kms_chunks WHERE file_id = $1::uuid RETURNING id
                )
                SELECT count(*) FROM deleted
                """,
                file_id,
            )

            # Soft-delete the file record
            await conn.execute(
                """
                UPDATE kms_files
                SET status = 'DELETED'::"FileStatus",
                    deleted_at = NOW(),
                    updated_at = NOW()
                WHERE id = $1::uuid
                """,
                file_id,
            )

            log.info(
                "file_soft_deleted_after_drive_removal",
                file_id=file_id,
                chunks_deleted=deleted_chunks,
            )
            return file_id

        finally:
            await conn.close()
