"""AMQP message handler: extract -> chunk -> embed -> upsert -> persist."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Optional

import aio_pika
import asyncpg
import structlog

from app.config import get_settings
from app.extractors.registry import get_extractor
from app.chunkers.text_chunker import chunk_text
from app.models.messages import FileDiscoveredMessage
from app.services.embedding_service import EmbeddingService
from app.services.qdrant_service import ChunkPoint, QdrantService
from app.utils.errors import ChunkingError, EmbeddingError, ExtractionError, KMSWorkerError

logger = structlog.get_logger(__name__)
settings = get_settings()


class EmbedHandler:
    """Processes a FileDiscoveredMessage: extract text -> chunk -> embed -> upsert -> persist.

    Args:
        db_pool: Async asyncpg connection pool used to update ``kms_files``.
        embedding_service: Service that encodes text chunks into BGE-M3 vectors.
        qdrant_service: Service that upserts chunk vectors into Qdrant.
    """

    def __init__(
        self,
        db_pool: asyncpg.Pool,
        embedding_service: Optional[EmbeddingService] = None,
        qdrant_service: Optional[QdrantService] = None,
    ) -> None:
        self._db = db_pool
        self._embedding_service = embedding_service or EmbeddingService()
        self._qdrant_service = qdrant_service or QdrantService()

    async def handle(self, message: aio_pika.IncomingMessage) -> None:
        """Process a single AMQP message from the embed queue.

        Parses the message body as :class:`~app.models.messages.FileDiscoveredMessage`,
        runs the full extract-chunk-embed-persist pipeline, and acks or nacks the
        AMQP message depending on the outcome.

        Args:
            message: Raw AMQP message from aio-pika.
        """
        try:
            payload = json.loads(message.body)
            msg = FileDiscoveredMessage.model_validate(payload)
        except Exception as e:
            logger.error(
                "Invalid embed message — dead-lettering",
                error=str(e),
                body=message.body[:200],
            )
            await message.reject(requeue=False)
            return

        log = logger.bind(
            filename=msg.original_filename,
            mime_type=msg.mime_type,
            source_id=str(msg.source_id),
        )
        log.info("Processing file")

        try:
            extracted_text = await self._extract_text(msg)
            chunks = await self._chunk(extracted_text)

            if chunks and settings.embedding_enabled:
                chunk_points = await self._embed_chunks(msg, chunks)
                await self._qdrant_service.ensure_collection()
                await self._qdrant_service.upsert_chunks(chunk_points)
                log.info("Chunk vectors upserted to Qdrant", chunk_count=len(chunk_points))

            await self._persist_file(msg, extracted_text, chunks)
            log.info("File persisted", chunk_count=len(chunks))
            await message.ack()

        except KMSWorkerError as e:
            log.error(
                "Embed processing failed",
                code=e.code,
                retryable=e.retryable,
                error=str(e),
            )
            if e.retryable:
                await message.nack(requeue=True)
            else:
                await message.reject(requeue=False)

        except Exception as e:
            log.error("Unexpected error processing file", error=str(e))
            await message.nack(requeue=True)

    async def _extract_text(self, msg: FileDiscoveredMessage) -> str:
        """Extract raw text from the file described by the message.

        Args:
            msg: Parsed ``FileDiscoveredMessage`` with file location and MIME type.

        Returns:
            Extracted text, or an empty string if no extractor is registered for
            the MIME type or the file is not present on disk.

        Raises:
            ExtractionError: Wraps any exception raised by the extractor.
        """
        extractor = get_extractor(msg.mime_type)
        if not extractor:
            logger.debug(
                "No extractor available — skipping text extraction",
                mime_type=msg.mime_type,
            )
            return ""

        file_path = Path(msg.file_path)
        if not file_path.exists():
            logger.warning("File not found on disk", file_path=msg.file_path)
            return ""

        try:
            return await extractor.extract(file_path)
        except Exception as e:
            raise ExtractionError(msg.file_path, str(e)) from e

    async def _chunk(self, text: str) -> list:
        """Chunk extracted text, wrapping errors in ChunkingError.

        Args:
            text: Full extracted text to split into overlapping chunks.

        Returns:
            List of :class:`~app.models.messages.TextChunk` objects.

        Raises:
            ChunkingError: If the chunker raises an unexpected exception.
        """
        try:
            return chunk_text(text) if text else []
        except Exception as e:
            raise ChunkingError(str(e)) from e

    async def _embed_chunks(self, msg: FileDiscoveredMessage, chunks: list) -> list[ChunkPoint]:
        """Generate embeddings for each chunk and build ChunkPoint list.

        Args:
            msg: Original message, providing metadata for the Qdrant payload.
            chunks: List of :class:`~app.models.messages.TextChunk` objects.

        Returns:
            List of :class:`~app.services.qdrant_service.ChunkPoint` objects
            ready for upsert.

        Raises:
            EmbeddingError: If the embedding model call fails.
        """
        texts = [c.text for c in chunks]
        try:
            vectors = await self._embedding_service.encode_batch(texts)
        except EmbeddingError:
            raise
        except Exception as exc:
            raise EmbeddingError(str(exc)) from exc

        points: list[ChunkPoint] = []
        for chunk, vector in zip(chunks, vectors):
            points.append(
                ChunkPoint(
                    id=str(uuid.uuid4()),
                    vector=vector,
                    payload={
                        "file_id": str(msg.scan_job_id),
                        "source_id": str(msg.source_id),
                        "user_id": str(msg.user_id),
                        "chunk_index": chunk.chunk_index,
                        "text": chunk.text,
                        "mime_type": msg.mime_type,
                    },
                )
            )
        return points

    async def _persist_file(
        self, msg: FileDiscoveredMessage, text: str, chunks: list
    ) -> None:
        """Update the ``kms_files`` row to PROCESSED and persist chunks to ``kms_chunks``.

        Sets ``status = 'PROCESSED'`` on the ``kms_files`` row identified by
        ``checksum_sha256`` in the ``public`` schema (table ``kms_files``).
        Then inserts each chunk into ``kms_chunks`` with ``ON CONFLICT DO NOTHING``
        so that re-processing a file is idempotent.

        Args:
            msg: Parsed message providing lookup keys and metadata.
            text: Full extracted text (unused directly; content is stored per-chunk).
            chunks: List of :class:`~app.models.messages.TextChunk` objects to persist.
        """
        # 1. Mark the kms_files row as processed (public schema, table kms_files).
        await self._db.execute(
            """
            UPDATE kms_files
               SET status     = 'PROCESSED',
                   updated_at = now()
             WHERE checksum_sha256 = $1
            """,
            msg.checksum_sha256,
        )

        # 2. Persist each chunk into kms_chunks; ignore duplicates.
        for chunk in chunks:
            chunk_id = str(uuid.uuid5(
                uuid.NAMESPACE_URL,
                f"{msg.checksum_sha256}-{chunk.chunk_index}",
            ))
            await self._db.execute(
                """
                INSERT INTO kms_chunks (
                    id, file_id, chunk_index, content, token_count, created_at
                ) VALUES (
                    $1::uuid, $2::uuid, $3, $4, $5, now()
                )
                ON CONFLICT DO NOTHING
                """,
                chunk_id,
                str(msg.scan_job_id),
                chunk.chunk_index,
                chunk.text,
                chunk.token_count or len(chunk.text.split()),
            )
