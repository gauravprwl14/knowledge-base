from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
import datetime

class FileDiscoveredMessage(BaseModel):
    """Received from kms.embed queue (published by scan-worker or kms-api ingest).

    The ``inline_content`` field is set when the Obsidian plugin (or any direct
    ingest caller) pushes note content without writing it to disk first.  When
    present, the embed-worker skips the disk-read step and uses this string as
    the extracted text directly.
    """

    scan_job_id: UUID
    source_id: UUID
    user_id: UUID
    file_path: str
    original_filename: str
    mime_type: Optional[str] = None
    file_size_bytes: Optional[int] = None
    last_modified: Optional[datetime.datetime] = None
    checksum_sha256: Optional[str] = None
    source_type: str
    source_metadata: dict = Field(default_factory=dict)
    inline_content: Optional[str] = None

class TextChunk(BaseModel):
    chunk_index: int
    text: str
    start_char: int
    end_char: int
    token_count: Optional[int] = None
