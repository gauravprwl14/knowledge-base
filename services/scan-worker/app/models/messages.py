"""Message models for the scan-worker AMQP pipeline.

These Pydantic models are the canonical wire format exchanged between:
- **kms.scan** queue: :class:`ScanJobMessage` consumed by ``ScanHandler``
- **kms.embed** queue: :class:`FileDiscoveredMessage` published by connectors
- **kms.dedup** queue: :class:`DedupCheckMessage` published alongside embed msgs
- **kms.delete** queue: :class:`FileDeletedMessage` published when a file is removed
"""

from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum
from uuid import UUID
import datetime


class SourceType(str, Enum):
    """Identifies the storage system a source connects to."""

    LOCAL = "local"
    GOOGLE_DRIVE = "google_drive"
    OBSIDIAN = "obsidian"
    EXTERNAL_DRIVE = "external_drive"


class ScanType(str, Enum):
    """Controls which files are (re)processed during a scan job.

    - FULL: index every matching file under the source root.
    - INCREMENTAL: skip files whose mtime and SHA-256 are unchanged.
    """

    FULL = "FULL"
    INCREMENTAL = "INCREMENTAL"


class ScanJobMessage(BaseModel):
    """Message consumed from the ``kms.scan`` queue.

    Published by kms-api when a source is connected or a manual re-scan
    is triggered.
    """

    scan_job_id: UUID
    source_id: UUID
    source_type: SourceType
    user_id: UUID
    # Scan type defaults to FULL for safety (re-index everything on first run)
    scan_type: ScanType = ScanType.FULL
    config: dict = Field(default_factory=dict)
    retry_count: int = 0
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)


class FileDiscoveredMessage(BaseModel):
    """Message published to the ``kms.embed`` queue after file discovery.

    Published by each connector for every file that should be embedded.
    The ``external_id`` and ``external_modified_at`` fields are used by the
    incremental scan logic to detect unchanged files on subsequent runs.

    When ``is_deleted`` is ``True`` the message signals that the file has been
    removed from the source.  The scan handler will soft-delete the corresponding
    ``kms_files`` row and its chunks instead of publishing an embed job.
    """

    scan_job_id: UUID
    source_id: UUID
    user_id: UUID
    # Stable identifier within the source (relative path for local, Drive file ID for GDrive)
    external_id: Optional[str] = None
    file_path: str
    original_filename: str
    mime_type: Optional[str] = None
    file_size_bytes: Optional[int] = None
    last_modified: Optional[datetime.datetime] = None
    checksum_sha256: Optional[str] = None
    # Timestamp from the source system — used for incremental mtime comparison
    external_modified_at: Optional[datetime.datetime] = None
    source_type: SourceType
    source_metadata: dict = Field(default_factory=dict)
    # Set to True when the file has been removed from the source (Drive removed=True)
    is_deleted: bool = False


KMS_DELETE_QUEUE = "kms.delete"
"""AMQP routing key for file-deletion events."""


class FileDeletedMessage(BaseModel):
    """Published when a file is removed from the source (e.g. deleted from Google Drive).

    Consumers of the ``kms.delete`` queue should:

    1. Delete Qdrant points filtered by ``file_id``.
    2. Delete ``kms_chunks`` rows for ``file_id``.
    3. Soft-delete the ``kms_files`` row (``status = 'DELETED'``).

    The scan-worker currently handles steps 2–3 inline rather than publishing
    to this queue.  The model is provided so a dedicated delete-worker can be
    wired up in a future iteration without changing the wire format.
    """

    file_id: str
    """UUID string of the ``kms_files`` row."""

    source_id: str
    """UUID string of the parent ``kms_sources`` row."""

    user_id: str
    """UUID string of the owning ``auth_users`` row."""

    external_id: str
    """Drive file ID (or other source-native identifier) — for logging."""

    original_filename: str | None = None
    """Human-readable filename, if available at deletion time."""

    deleted_at: str
    """ISO-8601 UTC timestamp when the deletion was detected."""


class DedupCheckMessage(BaseModel):
    """Message published to the ``kms.dedup`` queue for duplicate detection.

    The dedup-worker checks whether a file with the same checksum already
    exists for a different source and marks it as a duplicate if so.
    """

    file_path: str
    checksum_sha256: str
    source_id: UUID
    user_id: UUID
    file_size_bytes: Optional[int] = None


class ScanJobStatus(str, Enum):
    """Lifecycle states for a scan job, stored in ``kms_scan_jobs.status``."""

    QUEUED = "QUEUED"
    RUNNING = "RUNNING"    # maps to Prisma ScanJobStatus.RUNNING in kms_scan_jobs
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
