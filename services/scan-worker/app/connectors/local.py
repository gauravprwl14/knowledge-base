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

# Hidden directories to skip (Obsidian internals, OS metadata, etc.)
SKIP_DIRS = {'.obsidian', '.trash', '.git', '__pycache__', 'node_modules', '.DS_Store'}


class LocalFileConnector(BaseConnector):
    """
    Scans local filesystem paths including Obsidian vaults.

    Supports two scan modes:
    - FULL: index all matching files regardless of prior state
    - INCREMENTAL: skip files unchanged since last scan (mtime + SHA-256 check)
    """

    source_type = SourceType.LOCAL

    def __init__(self):
        self._root_path: Optional[Path] = None
        self._existing_files: dict[str, dict] = {}  # external_id → {sha256, mtime}

    async def connect(self, config: dict) -> None:
        """Establish connection by resolving and validating the vault path.

        Args:
            config: Source config dict. Expected key: ``path`` (default: ``/vault``).

        Raises:
            ScanJobFailedError: If the resolved path does not exist on disk.
        """
        self._root_path = Path(config.get("path", "/vault"))
        if not self._root_path.exists():
            raise ScanJobFailedError(
                f"Local path does not exist: {self._root_path}. "
                f"Check vault_path in source config and docker volume mount."
            )
        logger.info("local_connector_connected", path=str(self._root_path))

    async def preload_existing(self, source_id: str, file_sync_service) -> None:
        """Load existing file records from DB for incremental change detection.

        Called by the scan handler before ``list_files()`` on INCREMENTAL scans.
        Populates an in-memory dict keyed by ``external_id`` (relative path)
        so that ``list_files`` can skip unchanged files without extra DB calls.

        Args:
            source_id: UUID string of the source being scanned.
            file_sync_service: Instance of ``FileSyncService`` used to query the DB.
        """
        records = await file_sync_service.get_existing_files(source_id)
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
        """Yield a ``FileDiscoveredMessage`` for each file that should be (re)processed.

        On INCREMENTAL scans, files are skipped when both mtime and SHA-256
        are unchanged relative to the last recorded state.  The fast path
        checks mtime first; SHA-256 is only computed when mtime has changed.

        Args:
            job: The scan job message containing scan type and source metadata.

        Yields:
            FileDiscoveredMessage for each new or changed file.
        """
        max_bytes = settings.max_file_size_mb * 1024 * 1024
        extensions = set(settings.supported_extensions)
        is_incremental = job.scan_type == ScanType.INCREMENTAL

        for file_path in self._root_path.rglob("*"):
            # Skip hidden/system directories
            if any(part in SKIP_DIRS for part in file_path.parts):
                continue
            if not file_path.is_file():
                continue
            if file_path.suffix.lower() not in extensions:
                continue

            try:
                stat = file_path.stat()
                if stat.st_size > max_bytes:
                    logger.debug("skipping_oversized", path=str(file_path), bytes=stat.st_size)
                    continue

                # external_id = relative path from vault root (stable across rescans)
                relative_path = str(file_path.relative_to(self._root_path))
                mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)

                # ── Incremental change detection ──────────────────────────────
                if is_incremental and relative_path in self._existing_files:
                    existing = self._existing_files[relative_path]
                    existing_mtime = existing.get("mtime")

                    # Normalize both datetimes to UTC-naive for comparison
                    # (DB stores TIMESTAMP WITHOUT TIMEZONE; connector produces UTC-aware)
                    mtime_naive = mtime.replace(tzinfo=None)
                    existing_mtime_naive = (
                        existing_mtime.replace(tzinfo=None) if existing_mtime else None
                    )

                    # Fast path: mtime unchanged → skip without hashing
                    if existing_mtime_naive and abs(
                        (mtime_naive - existing_mtime_naive).total_seconds()
                    ) < 1:
                        logger.debug("skip_unchanged_mtime", path=relative_path)
                        continue

                    # mtime changed → compute hash to confirm content change
                    checksum = await self._compute_checksum(file_path)
                    if checksum == existing.get("sha256"):
                        logger.debug("skip_same_hash", path=relative_path)
                        continue

                    logger.info("file_changed", path=relative_path)
                else:
                    checksum = await self._compute_checksum(file_path)
                # ─────────────────────────────────────────────────────────────

                mime_type, _ = mimetypes.guess_type(str(file_path))
                if not mime_type:
                    mime_type = "application/octet-stream"

                yield FileDiscoveredMessage(
                    scan_job_id=job.scan_job_id,
                    source_id=job.source_id,
                    user_id=job.user_id,
                    external_id=relative_path,
                    file_path=str(file_path),
                    original_filename=file_path.name,
                    mime_type=mime_type,
                    file_size_bytes=stat.st_size,
                    checksum_sha256=checksum,
                    external_modified_at=mtime,
                    source_type=SourceType.LOCAL,
                    source_metadata={
                        "absolute_path": str(file_path.resolve()),
                        "vault_root": str(self._root_path),
                    },
                )

            except (OSError, PermissionError) as e:
                logger.warning("skipping_file_error", path=str(file_path), error=str(e))
                continue

    async def disconnect(self) -> None:
        """Release in-memory state from the connector."""
        self._existing_files.clear()

    @staticmethod
    async def _compute_checksum(path: Path) -> str:
        """Compute SHA-256 checksum of a file using streaming reads.

        Args:
            path: Absolute path to the file.

        Returns:
            Hex-encoded SHA-256 digest string.
        """
        sha256 = hashlib.sha256()
        async with aiofiles.open(path, "rb") as f:
            while chunk := await f.read(65536):
                sha256.update(chunk)
        return sha256.hexdigest()
