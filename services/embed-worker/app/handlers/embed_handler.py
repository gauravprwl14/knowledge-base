"""AMQP message handler: extract -> chunk -> embed -> upsert -> persist.

Pipeline steps
--------------
1. Parse the incoming AMQP message as a :class:`FileDiscoveredMessage`.
2. If the MIME type is audio/video, evaluate filter rules and — when
   transcription is enabled — publish a :class:`VoiceJobMessage` to
   ``kms.voice`` instead of running the normal text extraction path.
   A lightweight Qdrant metadata point is also upserted so the file is
   searchable before transcription completes.
3. If the message contains pre-extracted text (``source_type == "voice"``),
   skip disk extraction, chunk the text with timestamp alignment, and store
   the chunks in Qdrant with ``start_secs`` in each payload.
4. Otherwise: extract plain text → chunk → embed → upsert Qdrant → persist
   PostgreSQL, marking ``embed_status = COMPLETED``.
5. Ack, nack, or reject the AMQP message based on the outcome.
"""

from __future__ import annotations

import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import aio_pika
import asyncpg
import structlog

from app.config import get_settings
from app.connectors.google_drive_downloader import GoogleDriveDownloader
from app.extractors.registry import get_extractor
from app.chunkers.text_chunker import chunk_text
from app.models.messages import FileDiscoveredMessage, TextChunk
from app.services.embedding_service import EmbeddingService
from app.services.qdrant_service import ChunkPoint, QdrantService
from app.utils.errors import ChunkingError, EmbeddingError, ExtractionError, KMSWorkerError

logger = structlog.get_logger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# MIME type sets
# ---------------------------------------------------------------------------

AUDIO_VIDEO_MIME_TYPES: frozenset[str] = frozenset({
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/ogg",
    "audio/mp4", "audio/m4a", "audio/flac", "audio/webm", "audio/aac",
    "video/mp4", "video/quicktime", "video/x-msvideo", "video/webm",
    "video/mpeg", "video/x-matroska", "video/3gpp",
})


# ---------------------------------------------------------------------------
# Filter-rule helper
# ---------------------------------------------------------------------------

def _should_transcribe(
    msg: FileDiscoveredMessage,
    config: dict,
    source_config: dict,
) -> tuple[bool, str]:
    """Evaluate whether an audio/video file should be queued for transcription.

    Args:
        msg: The parsed ``FileDiscoveredMessage`` with file metadata.
        config: The KMS runtime feature-flag config dict (from ``.kms/config.json``).
        source_config: Per-source configuration dict (from ``source_metadata``).

    Returns:
        A ``(should_transcribe, skip_reason)`` tuple.  ``skip_reason`` is an
        empty string when the function returns ``True``.
    """
    # 1. Feature flag
    if not config.get("features", {}).get("voiceTranscription", {}).get("enabled", False):
        return False, "feature_disabled"

    # 2. Source-level transcription toggle
    if not source_config.get("transcribeVideos", True):
        return False, "disabled_for_source"

    # 3. File size ceiling
    max_mb: int = config.get("features", {}).get("voiceTranscription", {}).get("maxFileSizeMb", 500)
    if msg.file_size_bytes and msg.file_size_bytes > max_mb * 1024 * 1024:
        size_mb = msg.file_size_bytes // 1024 // 1024
        return False, f"file_too_large_{size_mb}mb"

    # 4. Filename exclude patterns
    exclude_patterns: list[str] = source_config.get("transcriptionExcludePatterns", [])
    filename_lower = (msg.original_filename or "").lower()
    for pattern in exclude_patterns:
        if pattern.lower() in filename_lower:
            return False, f"excluded_by_pattern_{pattern}"

    return True, ""


# ---------------------------------------------------------------------------
# Transcript chunk timestamp alignment
# ---------------------------------------------------------------------------

def _align_chunks_to_segments(
    chunks: list[TextChunk],
    segments: list[dict],
) -> list[TextChunk]:
    """Set ``start_secs`` on each chunk using Whisper segment timestamps.

    The algorithm scans through the Whisper segments in order and assigns
    the start time of the first segment whose text overlaps the chunk text.
    If no overlap is found the chunk inherits the last known timestamp.

    Args:
        chunks: Chunked transcript produced by :func:`chunk_text`.
        segments: Whisper segment dicts with ``start`` and ``text`` keys.

    Returns:
        The same chunks list with ``start_secs`` populated.
    """
    if not segments:
        return chunks

    seg_idx = 0
    last_secs: float = 0.0

    for chunk in chunks:
        chunk_text_lower = chunk.text.lower()
        # Advance segment pointer until one whose text is contained in or
        # overlaps the chunk text.
        while seg_idx < len(segments):
            seg_text = (segments[seg_idx].get("text") or "").lower().strip()
            if seg_text and seg_text[:20] in chunk_text_lower:
                last_secs = float(segments[seg_idx].get("start", last_secs))
                break
            seg_idx += 1
        chunk.start_secs = last_secs

    return chunks


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
        channel: Optional open ``aio_pika`` channel used to publish voice job
            messages to ``kms.voice``.  When ``None``, voice publishing is skipped.
        kms_config: KMS runtime feature-flag dict (loaded from ``.kms/config.json``).
            Defaults to ``{}`` (all feature flags treated as disabled).
    """

    def __init__(
        self,
        db_pool: asyncpg.Pool,
        embedding_service: Optional[EmbeddingService] = None,
        qdrant_service: Optional[QdrantService] = None,
        channel: Optional[aio_pika.abc.AbstractChannel] = None,
        kms_config: Optional[dict] = None,
    ) -> None:
        self._db = db_pool
        # Allow test injection; fall back to real (possibly mock-mode) services
        self._embedding_service = embedding_service or EmbeddingService()
        self._qdrant_service = qdrant_service or QdrantService()
        self._channel = channel
        self._kms_config: dict = kms_config or {}
        # Cache of GoogleDriveDownloader instances keyed by source_id string.
        # Built lazily on first Drive file encountered for each source.
        self._drive_cache: dict[str, GoogleDriveDownloader] = {}

    async def handle(self, message: aio_pika.IncomingMessage) -> None:
        """Process a single AMQP message from the kms.embed queue.

        Parses the message body as :class:`FileDiscoveredMessage`, dispatches to
        the appropriate pipeline path (voice queue, voice transcript embedding, or
        standard text embedding), and acks or nacks the AMQP message.

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
            source_type=msg.source_type,
        )
        log.info("Processing file for embedding")

        try:
            # ── Step 2: Route audio/video files to the voice transcription queue ──
            if msg.mime_type and msg.mime_type in AUDIO_VIDEO_MIME_TYPES:
                await self._handle_audio_video(msg, log)
                await message.ack()
                return

            # ── Step 3: Handle TranscriptionResultMessage (source_type == "voice") ─
            if msg.source_type == "voice" and (msg.extracted_text or msg.inline_content):
                await self._handle_voice_transcript(msg, log)
                await message.ack()
                return

            # ── Step 4: Standard text embedding pipeline ──────────────────────
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
            await self._mark_embed_failed(msg, str(e))
            if e.retryable:
                await message.nack(requeue=True)
            else:
                await message.reject(requeue=False)

        except Exception as e:
            log.error("Unexpected error processing file", error=str(e))
            await self._mark_embed_failed(msg, str(e))
            await message.nack(requeue=True)

    # ---------------------------------------------------------------------------
    # Audio / video routing
    # ---------------------------------------------------------------------------

    async def _handle_audio_video(
        self, msg: FileDiscoveredMessage, log: structlog.BoundLogger
    ) -> None:
        """Route an audio/video file to the voice transcription queue.

        Evaluates feature-flag and source-level filter rules.  When all rules
        pass, publishes a ``VoiceJobMessage`` to ``kms.voice`` and upserts a
        lightweight Qdrant metadata point so the file is searchable while
        transcription is pending.

        When publishing is skipped (flag disabled, file too large, etc.) the
        method logs the reason and returns without publishing.

        Args:
            msg: Parsed ``FileDiscoveredMessage`` for an audio/video file.
            log: Bound structlog logger carrying request-scoped fields.
        """
        source_config: dict = msg.source_metadata or {}
        should, reason = _should_transcribe(msg, self._kms_config, source_config)

        if not should:
            log.info("Voice transcription skipped", reason=reason)
            # Upsert a metadata-only Qdrant point so the file is discoverable
            await self._upsert_audio_metadata_point(msg)
            # Mark the file as INDEXED so it doesn't stay stuck in PENDING
            await self._persist_file(msg, "", [])
            return

        if self._channel is None:
            log.warning(
                "Voice channel not configured — skipping voice publish",
                filename=msg.original_filename,
            )
            await self._upsert_audio_metadata_point(msg)
            await self._persist_file(msg, "", [])
            return

        voice_job_id = str(uuid.uuid4())
        file_id = (msg.source_metadata or {}).get("file_id") or str(msg.scan_job_id)
        voice_msg = {
            "job_id": voice_job_id,
            "file_id": file_id,
            "source_id": str(msg.source_id),
            "user_id": str(msg.user_id),
            "file_path": msg.file_path,
            "original_filename": msg.original_filename,
            "mime_type": msg.mime_type,
            "file_size_bytes": msg.file_size_bytes,
            "language": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        await self._channel.default_exchange.publish(
            aio_pika.Message(
                body=json.dumps(voice_msg).encode(),
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            ),
            routing_key=settings.voice_queue,
        )
        log.info(
            "Voice job published",
            job_id=voice_job_id,
            voice_queue=settings.voice_queue,
        )

        # Upsert metadata point so the file is immediately searchable
        await self._upsert_audio_metadata_point(msg)

    async def _upsert_audio_metadata_point(self, msg: FileDiscoveredMessage) -> None:
        """Upsert a lightweight Qdrant metadata point for an audio/video file.

        The point carries filename, MIME type, and file size so that the file
        appears in search results before transcription completes.  A zero vector
        is used because there is no text to embed yet.

        Args:
            msg: Parsed ``FileDiscoveredMessage``.
        """
        if not settings.embedding_enabled:
            return
        try:
            await self._qdrant_service.ensure_collection()
            point_id = str(uuid.uuid5(
                uuid.NAMESPACE_URL,
                f"{msg.checksum_sha256 or msg.file_path}-meta",
            ))
            file_id = (msg.source_metadata or {}).get("file_id") or str(msg.scan_job_id)
            await self._qdrant_service.upsert_chunks([
                ChunkPoint(
                    id=point_id,
                    vector=[0.0] * 1024,
                    payload={
                        "user_id": str(msg.user_id),
                        "source_id": str(msg.source_id),
                        "file_id": file_id,
                        "filename": msg.original_filename,
                        "mime_type": msg.mime_type or "application/octet-stream",
                        "content": f"[audio/video: {msg.original_filename}]",
                        "chunk_index": 0,
                        "is_metadata_only": True,
                    },
                )
            ])
        except Exception as exc:
            # Non-fatal — log and continue
            logger.warning(
                "Failed to upsert audio metadata point",
                filename=msg.original_filename,
                error=str(exc),
            )

    # ---------------------------------------------------------------------------
    # Voice transcript embedding
    # ---------------------------------------------------------------------------

    async def _handle_voice_transcript(
        self, msg: FileDiscoveredMessage, log: structlog.BoundLogger
    ) -> None:
        """Embed a completed voice transcription result.

        The transcript text arrives pre-extracted in ``extracted_text`` (or
        ``inline_content`` for backward compat).  Chunks are aligned to Whisper
        segment timestamps when ``segments`` are present in ``source_metadata``.

        Args:
            msg: Parsed ``FileDiscoveredMessage`` with ``source_type == "voice"``.
            log: Bound structlog logger.
        """
        transcript = msg.extracted_text or msg.inline_content or ""
        if not transcript:
            log.warning("Voice transcript message has empty text — skipping")
            return

        # Chunk the transcript text
        raw_chunks = await self._chunk(transcript)

        # Align chunks to Whisper segment timestamps if available
        segments: list[dict] = (msg.source_metadata or {}).get("segments", [])
        if segments:
            raw_chunks = _align_chunks_to_segments(raw_chunks, segments)

        if raw_chunks and settings.embedding_enabled:
            chunk_points = await self._embed_voice_chunks(msg, raw_chunks)
            await self._qdrant_service.ensure_collection()
            await self._qdrant_service.upsert_chunks(chunk_points)
            log.info(
                "Voice transcript chunks upserted to Qdrant",
                chunk_count=len(chunk_points),
            )

        await self._persist_file(msg, transcript, raw_chunks)
        log.info("Voice transcript persisted", chunk_count=len(raw_chunks))

    async def _embed_voice_chunks(
        self, msg: FileDiscoveredMessage, chunks: list[TextChunk]
    ) -> list[ChunkPoint]:
        """Embed voice transcript chunks and build ChunkPoints with timestamps.

        Args:
            msg: Original message providing access-control metadata.
            chunks: Chunked transcript with optional ``start_secs`` set.

        Returns:
            List of :class:`ChunkPoint` objects ready for Qdrant upsert.

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
        file_id = (msg.source_metadata or {}).get("file_id") or str(msg.scan_job_id)
        for chunk_idx, (chunk, vector) in enumerate(zip(chunks, vectors)):
            payload: dict = {
                "user_id": str(msg.user_id),
                "source_id": str(msg.source_id),
                "file_id": file_id,
                "filename": msg.original_filename,
                "mime_type": "text/plain",
                "content": chunk.text,
                "chunk_index": chunk.chunk_index,
                "source_type": "voice_transcript",
            }
            if chunk.start_secs is not None:
                payload["start_secs"] = chunk.start_secs

            points.append(
                ChunkPoint(
                    id=str(uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        f"{msg.checksum_sha256 or msg.file_path}-voice-{chunk.chunk_index}",
                    )),
                    vector=vector,
                    payload=payload,
                )
            )
        return points

    # ---------------------------------------------------------------------------
    # Standard text pipeline (unchanged from original)
    # ---------------------------------------------------------------------------

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
        # If content was provided inline (e.g. Obsidian plugin push), skip disk read
        if msg.inline_content:
            return msg.inline_content

        # For Google Drive files: download content from Drive API instead of local disk
        if msg.source_type == "GOOGLE_DRIVE":
            return await self._extract_google_drive_text(msg)

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

    async def _extract_google_drive_text(self, msg: FileDiscoveredMessage) -> str:
        """Download and extract text from a Google Drive file.

        Fetches the file bytes from the Drive API using the OAuth2 credentials
        stored against the source, writes them to a temporary file, then runs
        the appropriate extractor.  Returns an empty string on any failure so
        that the embedding pipeline degrades gracefully instead of raising.

        Args:
            msg: Parsed ``FileDiscoveredMessage`` for a ``GOOGLE_DRIVE`` source.

        Returns:
            Extracted text string, or ``""`` if download or extraction fails.
        """
        external_id: str = (msg.source_metadata or {}).get("external_id") or msg.file_path
        if not external_id:
            logger.warning(
                "No external_id for Drive file — skipping extraction",
                source_id=str(msg.source_id),
                filename=msg.original_filename,
            )
            return ""

        # ── Build / retrieve cached downloader for this source ────────────────
        source_key = str(msg.source_id)
        if source_key not in self._drive_cache:
            row = await self._db.fetchrow(
                "SELECT encrypted_tokens FROM kms_sources WHERE id = $1::uuid",
                source_key,
            )
            if not row or not row["encrypted_tokens"]:
                logger.warning(
                    "No encrypted_tokens for Drive source — skipping extraction",
                    source_id=source_key,
                    filename=msg.original_filename,
                )
                return ""
            self._drive_cache[source_key] = GoogleDriveDownloader(
                encrypted_tokens=row["encrypted_tokens"],
                client_id=settings.google_client_id,
                client_secret=settings.google_client_secret,
            )

        downloader = self._drive_cache[source_key]

        # ── Download file bytes from Drive API ────────────────────────────────
        content_bytes = await downloader.download_content(
            external_id, msg.mime_type or ""
        )
        if content_bytes is None:
            logger.warning(
                "Drive download returned None — skipping extraction",
                external_id=external_id,
                filename=msg.original_filename,
            )
            return ""

        # ── Look up extractor by MIME type ────────────────────────────────────
        extractor = get_extractor(msg.mime_type)
        if not extractor:
            logger.debug(
                "No extractor for Drive file MIME type — skipping extraction",
                mime_type=msg.mime_type,
                filename=msg.original_filename,
            )
            return ""

        # ── Write to temp file and extract ────────────────────────────────────
        suffix = self._mime_to_ext(msg.mime_type or "")
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content_bytes)
            tmp_path = tmp.name
        try:
            return await extractor.extract(Path(tmp_path))
        except Exception as e:
            raise ExtractionError(msg.file_path, str(e)) from e
        finally:
            os.unlink(tmp_path)

    @staticmethod
    def _mime_to_ext(mime_type: str) -> str:
        """Map a MIME type string to a file extension for temp-file naming.

        Args:
            mime_type: MIME type string (e.g. ``"application/pdf"``).

        Returns:
            File extension including the leading dot (e.g. ``".pdf"``),
            or ``".bin"`` for unknown types.
        """
        _MAP: dict[str, str] = {
            "application/pdf": ".pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
            "text/markdown": ".md",
            "text/plain": ".txt",
            "text/csv": ".csv",
            "text/html": ".html",
            "application/json": ".json",
        }
        return _MAP.get(mime_type, ".bin")

    async def _chunk(self, text: str) -> list[TextChunk]:
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
        self, msg: FileDiscoveredMessage, chunks: list[TextChunk]
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

        file_id = (msg.source_metadata or {}).get("file_id") or str(msg.scan_job_id)
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
                        "file_id": file_id,
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
        self, msg: FileDiscoveredMessage, text: str, chunks: list[TextChunk]
    ) -> None:
        """Mark the kms_files row as INDEXED and persist chunks to PostgreSQL.

        The kms_files row was already created by the scan-worker.  This method
        updates its status to INDEXED and inserts chunk records.

        Args:
            msg: Parsed message providing lookup keys and metadata.
            text: Full extracted text (unused for DB storage — chunks hold content).
            chunks: List of :class:`~app.models.messages.TextChunk` objects.
        """
        # The actual kms_files.id is passed in source_metadata by the scan-worker
        file_id = (msg.source_metadata or {}).get("file_id") or str(msg.scan_job_id)

        # Step 5a: Mark the file as INDEXED
        await self._db.execute(
            """
            UPDATE kms_files
               SET status     = 'INDEXED'::\"FileStatus\",
                   indexed_at = now(),
                   updated_at = now()
             WHERE id = $1::uuid
            """,
            file_id,
        )

        # Step 5b: Insert each chunk with a deterministic UUID so re-processing
        # the same file produces the same chunk IDs (enables ON CONFLICT / upsert
        # to be truly idempotent).  source_id and user_id are included so the
        # BM25 service can filter by them without joining kms_files.
        for chunk in chunks:
            chunk_id = str(uuid.uuid5(
                uuid.NAMESPACE_URL,
                f"{msg.checksum_sha256 or msg.file_path}-{chunk.chunk_index}",
            ))
            await self._db.execute(
                """
                INSERT INTO kms_chunks (
                    id, file_id, user_id, source_id, chunk_index, content,
                    token_count, created_at
                ) VALUES (
                    $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, now()
                )
                ON CONFLICT (id) DO UPDATE SET
                    content     = EXCLUDED.content,
                    token_count = EXCLUDED.token_count
                """,
                chunk_id,
                file_id,
                str(msg.user_id),
                str(msg.source_id),
                chunk.chunk_index,
                chunk.text,
                chunk.token_count or len(chunk.text.split()),
            )

    async def _mark_embed_failed(
        self, msg: FileDiscoveredMessage, error: str
    ) -> None:
        """Update ``kms_files.status`` to ``ERROR`` on processing errors.

        Best-effort — failures here are logged and swallowed so they don't
        mask the original error that triggered the call.

        Args:
            msg: Original message providing the file id for lookup.
            error: Short error description for logging.
        """
        file_id = (msg.source_metadata or {}).get("file_id") or str(msg.scan_job_id)
        try:
            await self._db.execute(
                """
                UPDATE kms_files
                   SET status     = 'ERROR'::\"FileStatus\",
                       updated_at = now()
                 WHERE id = $1::uuid
                """,
                file_id,
            )
        except Exception as db_err:
            # DB write failure during error handling must not raise — just log
            logger.warning(
                "Failed to mark status=ERROR in DB",
                file_id=file_id,
                error=str(db_err),
            )
