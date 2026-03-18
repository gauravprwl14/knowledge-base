"""AMQP message handler: extract -> chunk -> embed -> upsert -> persist.

Pipeline steps
--------------
1. Parse the incoming AMQP message as a :class:`FileDiscoveredMessage`.
2. Extract plain text from the file using the MIME-type-aware extractor registry.
3. Split the text into overlapping chunks with :func:`chunk_text`.
4. If embedding is enabled (``EMBEDDING_ENABLED=true``), encode each chunk
   with :class:`EmbeddingService` and upsert the resulting vectors into Qdrant
   via :class:`QdrantService`.
5. Persist the file record and individual chunks to ``kms_files`` /
   ``kms_chunks`` in PostgreSQL, marking ``embed_status`` as ``COMPLETED``
   (or ``FAILED`` if any step above raised an exception).
6. Ack, nack, or reject the AMQP message based on the outcome.
"""

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

    The handler is intentionally stateless across messages — each call to
    :meth:`handle` is fully self-contained and safe to run concurrently.

    Args:
        db_pool: Async asyncpg connection pool used to update ``kms_files``
            and insert rows into ``kms_chunks``.
        embedding_service: Service that encodes text chunks into BGE-M3 vectors.
            Defaults to a new :class:`EmbeddingService` (respects ``MOCK_EMBEDDING``).
        qdrant_service: Service that upserts chunk vectors into Qdrant.
            Defaults to a new :class:`QdrantService` (respects ``MOCK_QDRANT``).
    """

    def __init__(
        self,
        db_pool: asyncpg.Pool,
        embedding_service: Optional[EmbeddingService] = None,
        qdrant_service: Optional[QdrantService] = None,
    ) -> None:
        self._db = db_pool
        # Allow test injection; fall back to real (possibly mock-mode) services
        self._embedding_service = embedding_service or EmbeddingService()
        self._qdrant_service = qdrant_service or QdrantService()

    async def handle(self, message: aio_pika.IncomingMessage) -> None:
        """Process a single AMQP message from the kms.embed queue.

        Parses the message body as :class:`FileDiscoveredMessage`, runs the
        full extract-chunk-embed-persist pipeline, and acks or nacks the AMQP
        message depending on the outcome.

        Error handling strategy:
        - Invalid JSON / schema validation → reject (dead-letter, no retry)
        - :class:`KMSWorkerError` with ``retryable=True`` → nack (requeue)
        - :class:`KMSWorkerError` with ``retryable=False`` → reject (dead-letter)
        - Unexpected exception → nack (requeue; may eventually reach DLQ)

        Args:
            message: Raw AMQP message from aio-pika.
        """
        # ── Step 1: Parse the message ─────────────────────────────────────────
        try:
            payload = json.loads(message.body)
            msg = FileDiscoveredMessage.model_validate(payload)
        except Exception as e:
            # Malformed message — dead-letter immediately; retrying won't help
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
            file_id=str(msg.scan_job_id),
        )
        log.info("Processing file for embedding")

        try:
            # ── Step 2: Extract plain text from file ──────────────────────────
            extracted_text = await self._extract_text(msg)

            # ── Step 3: Chunk the extracted text ──────────────────────────────
            chunks = await self._chunk(extracted_text)

            # ── Step 4: Embed + upsert to Qdrant (if embedding is enabled) ────
            if chunks and settings.embedding_enabled:
                # Build vector points from chunk texts and message metadata
                chunk_points = await self._embed_chunks(msg, chunks)

                # Ensure the Qdrant collection exists before upserting
                await self._qdrant_service.ensure_collection()

                # Upsert the dense vector points into Qdrant kms_chunks collection
                await self._qdrant_service.upsert_chunks(chunk_points)
                log.info(
                    "Chunk vectors upserted to Qdrant",
                    chunk_count=len(chunk_points),
                )

            # ── Step 5: Persist file record + chunks in PostgreSQL ────────────
            await self._persist_file(msg, extracted_text, chunks)
            log.info("File persisted", chunk_count=len(chunks))

            # ── Step 6: Ack the message — pipeline completed successfully ─────
            await message.ack()

        except KMSWorkerError as e:
            log.error(
                "Embed processing failed",
                code=e.code,
                retryable=e.retryable,
                error=str(e),
            )
            # Update kms_files embed_status to FAILED so dashboards reflect reality
            await self._mark_embed_failed(msg, str(e))

            if e.retryable:
                # Transient failure (e.g. model OOM, Qdrant timeout) — requeue
                await message.nack(requeue=True)
            else:
                # Terminal failure (e.g. corrupt file) — dead-letter
                await message.reject(requeue=False)

        except Exception as e:
            log.error("Unexpected error processing file", error=str(e))
            # Mark as failed in DB even for unexpected errors
            await self._mark_embed_failed(msg, str(e))
            await message.nack(requeue=True)

    async def _extract_text(self, msg: FileDiscoveredMessage) -> str:
        """Extract raw text from the file described by the message.

        Looks up the appropriate extractor from the registry by MIME type.
        Returns an empty string if no extractor is registered (unknown MIME)
        or if the file is not present on disk.

        Args:
            msg: Parsed ``FileDiscoveredMessage`` with file location and MIME type.

        Returns:
            Extracted text string, or ``""`` if extraction is not possible.

        Raises:
            ExtractionError: Wraps any exception raised by the extractor
                (e.g. corrupt PDF, encoding error).
        """
        extractor = get_extractor(msg.mime_type)
        if not extractor:
            # No extractor registered for this MIME type — skip silently
            logger.debug(
                "No extractor available — skipping text extraction",
                mime_type=msg.mime_type,
            )
            return ""

        file_path = Path(msg.file_path)
        if not file_path.exists():
            # File may have been deleted between scan and embed; log and skip
            logger.warning("File not found on disk", file_path=msg.file_path)
            return ""

        try:
            return await extractor.extract(file_path)
        except Exception as e:
            # Wrap in typed error so the caller can decide on retry strategy
            raise ExtractionError(msg.file_path, str(e)) from e

    async def _chunk(self, text: str) -> list:
        """Split extracted text into overlapping chunks for embedding.

        Args:
            text: Full extracted text to split.  Empty string returns [].

        Returns:
            List of :class:`~app.models.messages.TextChunk` objects.

        Raises:
            ChunkingError: If the chunker raises an unexpected exception.
        """
        if not text:
            # Nothing to chunk — skip the call to avoid unnecessary work
            return []
        try:
            return chunk_text(text)
        except Exception as e:
            raise ChunkingError(str(e)) from e

    async def _embed_chunks(
        self, msg: FileDiscoveredMessage, chunks: list
    ) -> list[ChunkPoint]:
        """Generate embeddings for each chunk and build ChunkPoint list.

        Each ChunkPoint carries:
        - A UUID point ID (for idempotent upserts in Qdrant)
        - The 1024-dim BGE-M3 dense vector
        - A payload dict for access-control filtering and snippet display

        The payload schema (stored in Qdrant) must match what search-api
        expects when reconstructing search results.

        Args:
            msg: Original message providing metadata for the Qdrant payload.
            chunks: List of :class:`~app.models.messages.TextChunk` objects.

        Returns:
            List of :class:`~app.services.qdrant_service.ChunkPoint` objects
            ready for upsert.

        Raises:
            EmbeddingError: If the embedding model call fails.
        """
        # Extract the raw text from each chunk for batch encoding
        texts = [c.text for c in chunks]

        try:
            # encode_batch is the stable public method (embed is an alias)
            vectors = await self._embedding_service.encode_batch(texts)
        except EmbeddingError:
            raise  # Already typed; propagate as-is
        except Exception as exc:
            raise EmbeddingError(str(exc)) from exc

        points: list[ChunkPoint] = []
        for chunk_idx, (chunk, vector) in enumerate(zip(chunks, vectors)):
            points.append(
                ChunkPoint(
                    # Deterministic UUID based on file checksum + chunk index so
                    # re-processing the same file produces the same Qdrant point IDs
                    # (enabling idempotent upserts without duplicate vectors).
                    id=str(uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        f"{msg.checksum_sha256 or msg.file_path}-{chunk.chunk_index}",
                    )),
                    vector=vector,
                    payload={
                        # Access control — search-api filters by user_id at query time
                        "user_id": str(msg.user_id),
                        # Source scoping — allows per-source search
                        "source_id": str(msg.source_id),
                        # Back-reference to kms_files row
                        "file_id": str(msg.scan_job_id),
                        # Display metadata shown in search result snippets
                        "filename": msg.original_filename,
                        "mime_type": msg.mime_type or "application/octet-stream",
                        # Raw chunk text returned as search snippet
                        "content": chunk.text,
                        # Position in original document (used for result ordering)
                        "chunk_index": chunk.chunk_index,
                    },
                )
            )
        return points

    async def _persist_file(
        self, msg: FileDiscoveredMessage, text: str, chunks: list
    ) -> None:
        """Persist file record and chunks to PostgreSQL and update embed_status.

        Two writes happen inside this method:
        1. Upsert the ``kms_files`` row with extracted text, chunk count, and
           ``embed_status = 'COMPLETED'``.
        2. Insert each chunk into ``kms_chunks`` with ``ON CONFLICT DO NOTHING``
           so re-processing a file is idempotent.

        Args:
            msg: Parsed message providing lookup keys and metadata.
            text: Full extracted text (stored in ``kms_files.extracted_text``).
            chunks: List of :class:`~app.models.messages.TextChunk` objects.
        """
        # Step 5a: Update kms_files — upsert on (checksum_sha256, source_id)
        # so that re-scanning the same file updates the record rather than
        # inserting a duplicate.
        await self._db.execute(
            """
            INSERT INTO kms_files (
                id, source_id, user_id, file_path, original_filename,
                mime_type, file_size_bytes, checksum_sha256, source_type,
                extracted_text, chunk_count, embed_status, source_metadata,
                created_at, updated_at
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, 'COMPLETED', $11::jsonb, now(), now()
            )
            ON CONFLICT (checksum_sha256, source_id)
            DO UPDATE SET
                extracted_text = EXCLUDED.extracted_text,
                chunk_count    = EXCLUDED.chunk_count,
                embed_status   = 'COMPLETED',
                updated_at     = now()
            """,
            str(msg.source_id),
            str(msg.user_id),
            msg.file_path,
            msg.original_filename,
            msg.mime_type,
            msg.file_size_bytes,
            msg.checksum_sha256,
            msg.source_type,
            text,
            len(chunks),
            json.dumps(msg.source_metadata),
        )

        # Step 5b: Insert each chunk with a deterministic UUID so re-processing
        # the same file produces the same chunk IDs (enables ON CONFLICT DO NOTHING
        # to be truly idempotent rather than just silently swallowing errors).
        for chunk in chunks:
            chunk_id = str(uuid.uuid5(
                uuid.NAMESPACE_URL,
                f"{msg.checksum_sha256 or msg.file_path}-{chunk.chunk_index}",
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

    async def _mark_embed_failed(
        self, msg: FileDiscoveredMessage, error: str
    ) -> None:
        """Update ``kms_files.embed_status`` to ``FAILED`` on processing errors.

        Best-effort — failures here are logged and swallowed so they don't
        mask the original error that triggered the call.

        Args:
            msg: Original message providing the file checksum for lookup.
            error: Short error description stored in ``embed_error`` column.
        """
        try:
            await self._db.execute(
                """
                UPDATE kms_files
                   SET embed_status = 'FAILED',
                       embed_error  = $2,
                       updated_at   = now()
                 WHERE checksum_sha256 = $1
                """,
                msg.checksum_sha256,
                error[:500],  # Truncate to avoid exceeding column width
            )
        except Exception as db_err:
            # DB write failure during error handling must not raise — just log
            logger.warning(
                "Failed to mark embed_status=FAILED in DB",
                checksum=msg.checksum_sha256,
                error=str(db_err),
            )
