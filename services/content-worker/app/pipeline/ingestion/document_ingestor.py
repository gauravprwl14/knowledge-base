"""
Document ingestor — retrieves text from an existing KMS-indexed file.

For KMS_FILE and DOCUMENT source types. The file's text chunks are already
stored in PostgreSQL (kms_chunks table). We reassemble them by ordering on
chunk_index ASC — this is the authoritative order.

IMPORTANT: Do NOT use Qdrant for chunk reassembly. Qdrant stores vectors for
semantic search; its retrieval order is by relevance score, not document order.
The correct source is kms_chunks ORDER BY chunk_index ASC in PostgreSQL.

Prompt injection: chunk content is external data — callers wrap the returned
text in <external_content>...</external_content> before passing to Claude.
"""
import asyncpg
import structlog

from app.config import Settings
from app.errors import ContentIngestionError

logger = structlog.get_logger(__name__)


class DocumentIngestor:
    """
    Retrieves a KMS-indexed document's text content from PostgreSQL.

    Args:
        settings: Application configuration.
        db: Existing asyncpg connection pool.
    """

    def __init__(self, settings: Settings, db: asyncpg.Pool) -> None:
        self._settings = settings
        self._db = db

    async def ingest(self, source_file_id: str) -> str:
        """
        Reassemble a document's text from its kms_chunks rows.

        Chunks are joined in chunk_index ASC order — this preserves the
        original document structure (headings → paragraphs → footnotes).

        Args:
            source_file_id: UUID of the kms_files row.

        Returns:
            Full document text (all chunks joined with double newline).

        Raises:
            ContentIngestionError: If file not found or has no chunks.
        """
        log = logger.bind(file_id=source_file_id)
        log.info("doc_ingest_started")

        # Verify the file exists
        file_row = await self._db.fetchrow(
            "SELECT id, name FROM kms_files WHERE id = $1::uuid",
            source_file_id,
        )
        if file_row is None:
            raise ContentIngestionError(
                f"KMS file not found: {source_file_id}. "
                "The file may have been deleted."
            )

        # Reassemble chunks in document order.
        # chunk_index is the canonical document order — NOT Qdrant retrieval order.
        chunks = await self._db.fetch(
            """
            SELECT content
            FROM kms_chunks
            WHERE file_id = $1::uuid
            ORDER BY chunk_index ASC
            """,
            source_file_id,
        )

        if not chunks:
            raise ContentIngestionError(
                f"KMS file '{file_row['name']}' has no indexed chunks. "
                "The file may not have finished processing. "
                "Check that embed-worker completed successfully."
            )

        text = "\n\n".join(row["content"] for row in chunks if row["content"])
        log.info("doc_ingest_done", file_name=file_row["name"], chunks=len(chunks), chars=len(text))
        return text
