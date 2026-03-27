"""
Pydantic message models consumed by dedup-worker from the kms.dedup queue.
"""

from pydantic import BaseModel, Field


class DedupCheckMessage(BaseModel):
    """Message consumed from the kms.dedup queue.

    Published by scan-worker after a file is discovered and a checksum is available.

    Attributes:
        file_id: Unique identifier of the file record in kms_files.
        user_id: Identifier of the owning user.
        checksum_sha256: Hex-encoded SHA-256 hash of the file content.
        source_id: Identifier of the source the file was discovered from.
        file_size_bytes: Raw byte size of the file.
        file_name: Original filename as reported by the connector.
    """

    file_id: str = Field(..., description="UUID of the file in kms_files")
    user_id: str = Field(..., description="UUID of the owning user")
    checksum_sha256: str = Field(..., description="Hex-encoded SHA-256 of file content")
    source_id: str = Field(..., description="UUID of the originating source")
    file_size_bytes: int = Field(..., description="File size in bytes", ge=0)
    file_name: str = Field(..., description="Original filename from the connector")
