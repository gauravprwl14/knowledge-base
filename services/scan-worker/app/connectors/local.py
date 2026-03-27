"""Local filesystem connector — discovers files in a local or mounted directory.

Supports both Obsidian vaults and plain local folders.  The source type is
determined by the ``source_type`` field of the incoming :class:`ScanJobMessage`,
but the scan logic is identical for LOCAL and OBSIDIAN sources.

Scan modes
----------
- **FULL**: index every matching file under the root path.
- **INCREMENTAL**: skip files whose mtime and SHA-256 are unchanged since the
  last recorded scan (requires ``preload_existing()`` to be called first).
"""

import hashlib
import mimetypes
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator, Optional

import aiofiles
import structlog

from app.connectors.base import BaseConnector
from app.models.messages import FileDiscoveredMessage, ScanJobMessage, ScanType, SourceType
from app.config import get_settings
from app.utils.errors import ScanJobFailedError

logger = structlog.get_logger(__name__)
settings = get_settings()

# Directories that should never be indexed — Obsidian internals, OS metadata,
# version control, and package caches that would pollute the knowledge base.
SKIP_DIRS = {
    ".obsidian",   # Obsidian config & plugin files
    ".trash",      # Obsidian trash bin
    ".git",        # Git history
    "__pycache__", # Python bytecode cache
    "node_modules", # JS dependencies
    ".DS_Store",   # macOS metadata (file, not dir, but harmless to list here)
}

# Allowed file extensions — must match the MIME types handled by the extractor
# registry in embed-worker.  Files with other extensions are silently skipped.
ALLOWED_EXTENSIONS = {
    ".txt",
    ".md",
    ".pdf",
    ".docx",
    ".xlsx",
    ".csv",
    ".html",
}


class LocalFileConnector(BaseConnector):
    """Scans local filesystem paths including Obsidian vaults.

    Supports two scan modes:

    - **FULL**: index all matching files regardless of prior state.
    - **INCREMENTAL**: skip files unchanged since the last scan
      (mtime check first; SHA-256 only computed when mtime has changed).

    Attributes:
        _root_path: Resolved root directory for the scan (set in :meth:`connect`).
        _existing_files: Dict mapping ``external_id`` (relative path) to
            ``{sha256, mtime}`` records loaded from the DB for incremental scans.
    """

    source_type = SourceType.LOCAL

    def __init__(self) -> None:
        self._root_path: Optional[Path] = None
        # Populated by preload_existing() for INCREMENTAL scans;
        # empty dict means no prior state (safe for FULL scans).
        self._existing_files: dict[str, dict] = {}

    async def connect(self, config: dict) -> None:
        """Resolve and validate the vault/folder path from the source config.

        Args:
            config: Source config dict.  Expected key: ``path`` (defaults to
                ``/vault`` which matches the Docker volume mount in
                docker-compose.kms.yml).

        Raises:
            ScanJobFailedError: If the resolved path does not exist on disk.
                This is a terminal error — the job should not be retried until
                the path is fixed.
        """
        self._root_path = Path(config.get("path", "/vault"))
        if not self._root_path.exists():
            raise ScanJobFailedError(
                f"Local path does not exist: {self._root_path}. "
                f"Check vault_path in source config and verify the Docker volume mount."
            )
        logger.info("local_connector_connected", path=str(self._root_path))

    async def preload_existing(self, source_id: str, file_sync_service) -> None:
        """Load existing file records from DB for incremental change detection.

        Must be called by the scan handler **before** ``list_files()`` on
        INCREMENTAL scans.  Populates an in-memory dict keyed by
        ``external_id`` (relative path from vault root) so that
        ``list_files()`` can skip unchanged files without extra DB round-trips.

        Args:
            source_id: UUID string of the source being scanned.
            file_sync_service: Instance of ``FileSyncService`` used to query
                the ``kms_files`` table.
        """
        records = await file_sync_service.get_existing_files(source_id)
        # Build a lookup dict: relative_path → {sha256, mtime}
        self._existing_files = {
            r["external_id"]: {
                "sha256": r["checksum_sha256"],
                "mtime": r["external_modified_at"],
            }
            for r in records
            if r["external_id"]
        }
        logger.info(
            "incremental_preload_complete",
            source_id=source_id,
            existing_file_count=len(self._existing_files),
        )

    async def list_files(self, job: ScanJobMessage) -> AsyncIterator[FileDiscoveredMessage]:
        """Yield a :class:`FileDiscoveredMessage` for each file to be processed.

        Walk logic
        ----------
        1. ``rglob("*")`` traverses the directory tree recursively.
        2. Hidden/system directories (SKIP_DIRS) and non-file entries are skipped.
        3. Files with unsupported extensions or exceeding the size limit are skipped.
        4. For INCREMENTAL scans, unchanged files (same mtime ± 1 s AND same SHA-256)
           are skipped to avoid redundant embedding work.
        5. Yielded messages carry ``external_id`` (relative path from root) so that
           subsequent scans can detect renames and deletions.

        Args:
            job: The scan job message supplying scan type and source metadata.

        Yields:
            :class:`FileDiscoveredMessage` for each new or changed file.
        """
        max_bytes = settings.max_file_size_mb * 1024 * 1024
        # Use ALLOWED_EXTENSIONS set (whitelist approach) for security — we
        # only process file types we know how to extract text from.
        extensions = ALLOWED_EXTENSIONS
        is_incremental = job.scan_type == ScanType.INCREMENTAL

        # rglob("*") visits every node under _root_path recursively
        for file_path in self._root_path.rglob("*"):

            # ── Skip hidden/system directories ────────────────────────────────
            # Check every path component so deeply nested .obsidian dirs are caught.
            if any(part in SKIP_DIRS for part in file_path.parts):
                continue

            # ── Only process regular files ────────────────────────────────────
            if not file_path.is_file():
                continue

            # ── Extension filter — skip binary/unsupported formats ────────────
            if file_path.suffix.lower() not in extensions:
                continue

            try:
                stat = file_path.stat()

                # ── Size guard — skip very large files to protect embed-worker ──
                if stat.st_size > max_bytes:
                    logger.debug(
                        "skipping_oversized",
                        path=str(file_path),
                        bytes=stat.st_size,
                    )
                    continue

                # external_id = path relative to vault root — this is the stable
                # key used for change detection across re-scans (survives file
                # content changes; does NOT survive renames).
                relative_path = str(file_path.relative_to(self._root_path))
                mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)

                # ── Incremental change detection ──────────────────────────────
                if is_incremental and relative_path in self._existing_files:
                    existing = self._existing_files[relative_path]
                    existing_mtime = existing.get("mtime")

                    # Normalise to UTC-naive for comparison — the DB stores
                    # TIMESTAMP WITHOUT TIMEZONE while the OS gives UTC-aware.
                    mtime_naive = mtime.replace(tzinfo=None)
                    existing_mtime_naive = (
                        existing_mtime.replace(tzinfo=None)
                        if existing_mtime
                        else None
                    )

                    # Fast path: mtime unchanged (within 1 s) → skip without hashing.
                    # The 1-second tolerance handles FAT32 filesystem precision.
                    if existing_mtime_naive and abs(
                        (mtime_naive - existing_mtime_naive).total_seconds()
                    ) < 1:
                        logger.debug("skip_unchanged_mtime", path=relative_path)
                        continue

                    # mtime changed → compute SHA-256 to confirm content change.
                    # This avoids re-indexing files that were only "touched"
                    # (e.g. by a backup tool) without content modification.
                    checksum = await self._compute_checksum(file_path)
                    if checksum == existing.get("sha256"):
                        logger.debug("skip_same_hash", path=relative_path)
                        continue

                    logger.info("file_changed_will_reindex", path=relative_path)
                else:
                    # FULL scan or new file not yet in DB — always compute checksum
                    checksum = await self._compute_checksum(file_path)
                # ─────────────────────────────────────────────────────────────

                # Guess MIME type from extension (fallback: octet-stream).
                # The extractor registry in embed-worker uses MIME type to pick
                # the right extractor, so an accurate guess is important.
                mime_type, _ = mimetypes.guess_type(str(file_path))
                if not mime_type:
                    mime_type = "application/octet-stream"

                yield FileDiscoveredMessage(
                    scan_job_id=job.scan_job_id,
                    source_id=job.source_id,
                    user_id=job.user_id,
                    # Relative path used as external_id — stable across rescans
                    external_id=relative_path,
                    file_path=str(file_path),
                    original_filename=file_path.name,
                    mime_type=mime_type,
                    file_size_bytes=stat.st_size,
                    checksum_sha256=checksum,
                    external_modified_at=mtime,
                    source_type=SourceType.LOCAL,
                    source_metadata={
                        # Absolute path stored for diagnostics / re-scan reference
                        "absolute_path": str(file_path.resolve()),
                        "vault_root": str(self._root_path),
                    },
                )

            except (OSError, PermissionError) as e:
                # File permission errors and OS errors must not crash the scan.
                # Log and continue so the rest of the vault is still indexed.
                logger.warning(
                    "skipping_file_error",
                    path=str(file_path),
                    error=str(e),
                )
                continue

    async def disconnect(self) -> None:
        """Release in-memory state accumulated during the scan."""
        # Clear the existing files cache to free memory between scans
        self._existing_files.clear()

    @staticmethod
    async def _compute_checksum(path: Path) -> str:
        """Compute the SHA-256 checksum of a file using streaming reads.

        Streams the file in 64 KB blocks to handle large files without
        loading them entirely into memory.

        Args:
            path: Absolute path to the file.

        Returns:
            Hex-encoded SHA-256 digest string (64 characters).
        """
        sha256 = hashlib.sha256()
        # 64 KB blocks balance memory use against syscall overhead
        async with aiofiles.open(path, "rb") as f:
            while chunk := await f.read(65536):
                sha256.update(chunk)
        return sha256.hexdigest()
