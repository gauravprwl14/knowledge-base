from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum
from uuid import UUID
import datetime


class SourceType(str, Enum):
    LOCAL = "local"
    GOOGLE_DRIVE = "google_drive"
    OBSIDIAN = "obsidian"
    EXTERNAL_DRIVE = "external_drive"


class ScanJobMessage(BaseModel):
    """Message consumed from kms.scan queue."""
    scan_job_id: UUID
    source_id: UUID
    source_type: SourceType
    user_id: UUID
    config: dict = Field(default_factory=dict)
    retry_count: int = 0
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)


class FileDiscoveredMessage(BaseModel):
    """Message published to kms.embed queue after file discovery."""
    scan_job_id: UUID
    source_id: UUID
    user_id: UUID
    file_path: str
    original_filename: str
    mime_type: Optional[str] = None
    file_size_bytes: Optional[int] = None
    last_modified: Optional[datetime.datetime] = None
    checksum_sha256: Optional[str] = None
    source_type: SourceType
    source_metadata: dict = Field(default_factory=dict)


class DedupCheckMessage(BaseModel):
    """Message published to kms.dedup queue for duplicate detection."""
    file_path: str
    checksum_sha256: str
    source_id: UUID
    user_id: UUID
    file_size_bytes: Optional[int] = None


class ScanJobStatus(str, Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
