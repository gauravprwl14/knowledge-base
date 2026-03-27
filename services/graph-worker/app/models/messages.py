"""
Pydantic message models consumed by graph-worker from the kms.graph queue.
"""

from pydantic import BaseModel, Field


class GraphBuildMessage(BaseModel):
    """Message consumed from the kms.graph queue (chunk-ID variant).

    Published by embed-worker (or kms-api) after chunks have been stored and
    are ready for graph relationship extraction. Chunk text is fetched from
    PostgreSQL using the provided chunk_ids.

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


class GraphJobMessage(BaseModel):
    """Message consumed from the kms.graph queue (inline-chunks variant).

    Used when the producer embeds chunk text directly in the message body,
    avoiding an extra PostgreSQL round-trip. The worker extracts entities and
    wiki-links from each chunk and writes the resulting nodes and relationships
    to Neo4j, then updates the file status in PostgreSQL to GRAPH_INDEXED.

    Attributes:
        file_id: Unique identifier of the parent file record in kms_files.
        source_id: Identifier of the source the file was ingested from.
        user_id: Identifier of the owning user.
        filename: Original filename from the connector.
        chunks: Inline text content of all chunks belonging to this file.
        mime_type: MIME type of the file (e.g. ``text/markdown``).
    """

    file_id: str = Field(..., description="UUID of the file in kms_files")
    source_id: str = Field(..., description="UUID of the originating source")
    user_id: str = Field(..., description="UUID of the owning user")
    filename: str = Field(..., description="Original filename from the connector")
    chunks: list[str] = Field(..., description="Inline text content of all chunks")
    mime_type: str = Field(..., description="MIME type of the file")
