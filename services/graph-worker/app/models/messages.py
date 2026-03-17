"""
Pydantic message models consumed by graph-worker from the kms.graph queue.
"""

from pydantic import BaseModel, Field


class GraphBuildMessage(BaseModel):
    """Message consumed from the kms.graph queue.

    Published by embed-worker (or kms-api) after chunks have been stored and
    are ready for graph relationship extraction.

    Attributes:
        file_id: Unique identifier of the parent file record in kms_files.
        chunk_ids: Ordered list of chunk UUIDs belonging to this file in kms_chunks.
        user_id: Identifier of the owning user.
        source_id: Identifier of the source the file was ingested from.
        file_name: Original filename, used as the File node's ``name`` property.
        mime_type: MIME type of the file, stored on the File node for filtering.
    """

    file_id: str = Field(..., description="UUID of the file in kms_files")
    chunk_ids: list[str] = Field(..., description="Ordered list of chunk UUIDs in kms_chunks")
    user_id: str = Field(..., description="UUID of the owning user")
    source_id: str = Field(..., description="UUID of the originating source")
    file_name: str = Field(..., description="Original filename from the connector")
    mime_type: str = Field(..., description="MIME type of the file")
