import json
from pathlib import Path

import aio_pika
import asyncpg
import structlog

from app.config import get_settings
from app.extractors.registry import get_extractor
from app.chunkers.text_chunker import chunk_text
from app.models.messages import FileDiscoveredMessage
from app.utils.errors import KMSWorkerError, ExtractionError, ChunkingError

logger = structlog.get_logger(__name__)
settings = get_settings()


class EmbedHandler:
    """Processes a FileDiscoveredMessage: extract text -> chunk -> persist."""

    def __init__(self, db_pool: asyncpg.Pool):
        self._db = db_pool

    async def handle(self, message: aio_pika.IncomingMessage) -> None:
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
        """Chunk extracted text, wrapping errors in ChunkingError."""
        try:
            return chunk_text(text) if text else []
        except Exception as e:
            raise ChunkingError(str(e)) from e

    async def _persist_file(self, msg: FileDiscoveredMessage, text: str, chunks: list) -> None:
        """Upsert file record into kms.files with extracted text and chunk count."""
        await self._db.execute("""
            INSERT INTO kms.files (
                id, source_id, user_id, file_path, original_filename,
                mime_type, file_size_bytes, checksum_sha256, source_type,
                extracted_text, chunk_count, embed_status, source_metadata,
                created_at, updated_at
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, 'extracted', $11::jsonb, now(), now()
            )
            ON CONFLICT (checksum_sha256, source_id)
            DO UPDATE SET
                extracted_text = EXCLUDED.extracted_text,
                chunk_count = EXCLUDED.chunk_count,
                embed_status = 'extracted',
                updated_at = now()
        """,
            str(msg.source_id), str(msg.user_id), msg.file_path, msg.original_filename,
            msg.mime_type, msg.file_size_bytes, msg.checksum_sha256, msg.source_type,
            text, len(chunks), json.dumps(msg.source_metadata),
        )
