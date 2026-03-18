"""AMQP message handler for voice transcription jobs.

Consumes ``VoiceJobMessage`` records from the ``kms.voice`` queue, runs
Whisper transcription, persists the result to ``kms_voice_jobs``, and
publishes a ``TranscriptionResultMessage`` to the ``kms.embed`` queue.

Message lifecycle:
    QUEUED (kms.voice) → RUNNING → COMPLETED → TranscriptionResultMessage (kms.embed)
                                 → FAILED (on terminal error, message rejected to DLQ)
"""
from __future__ import annotations

import json
import os

import aio_pika
import structlog
from pydantic import ValidationError

from app.config import settings
from app.models.messages import TranscriptionResultMessage, VoiceJobMessage
from app.services.job_store import JobStore
from app.services.whisper_service import WhisperService
from app.utils.errors import FileTooLargeError, TranscriptionError, UnsupportedAudioFormatError

logger = structlog.get_logger(__name__)


class TranscriptionHandler:
    """Processes ``VoiceJobMessage`` records end-to-end.

    Responsibilities:
    1. Parse and validate the incoming AMQP message body.
    2. Ensure the job row exists in ``kms_voice_jobs``.
    3. Validate file size and MIME type constraints.
    4. Delegate transcription to :class:`~app.services.whisper_service.WhisperService`.
    5. Publish a :class:`~app.models.messages.TranscriptionResultMessage` to ``kms.embed``.
    6. Update the job row to ``COMPLETED`` or ``FAILED``.
    7. Ack/nack/reject the AMQP message based on outcome.

    Args:
        whisper_service: Pre-loaded :class:`~app.services.whisper_service.WhisperService`.
        job_store: :class:`~app.services.job_store.JobStore` for DB persistence.
        channel: Open ``aio_pika`` channel used to publish result messages.
    """

    def __init__(
        self,
        whisper_service: WhisperService,
        job_store: JobStore,
        channel: aio_pika.abc.AbstractChannel,
    ) -> None:
        self._whisper = whisper_service
        self._store = job_store
        self._channel = channel

    async def handle(self, message: aio_pika.abc.AbstractIncomingMessage) -> None:
        """Process a single AMQP message from the ``kms.voice`` queue.

        Args:
            message: The raw incoming AMQP message. The handler is responsible
                for acking, nacking, or rejecting it.
        """
        async with message.process(ignore_processed=True):
            await self._handle_inner(message)

    async def _handle_inner(
        self, message: aio_pika.abc.AbstractIncomingMessage
    ) -> None:
        """Inner handler — parses and processes the message.

        Separated from :meth:`handle` so tests can call it directly without
        the ``process()`` context manager.

        Args:
            message: The incoming AMQP message.
        """
        # ------------------------------------------------------------------
        # 1. Parse message body
        # ------------------------------------------------------------------
        try:
            payload = json.loads(message.body.decode())
            msg = VoiceJobMessage.model_validate(payload)
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.error(
                "voice_message_parse_failed",
                error=str(exc),
                body=message.body[:200],
            )
            await message.reject(requeue=False)
            return

        log = logger.bind(
            job_id=str(msg.job_id),
            file_id=str(msg.file_id),
            source_id=str(msg.source_id),
            file_path=msg.file_path,
        )
        log.info("voice_job_received")

        # ------------------------------------------------------------------
        # 2. Ensure job row exists (idempotent)
        # ------------------------------------------------------------------
        await self._store.create_job_if_missing(msg)

        # ------------------------------------------------------------------
        # 3. Mark job RUNNING
        # ------------------------------------------------------------------
        await self._store.update_status(str(msg.job_id), "RUNNING")

        # ------------------------------------------------------------------
        # 4. Validate constraints
        # ------------------------------------------------------------------
        try:
            self._validate(msg)
        except (FileTooLargeError, UnsupportedAudioFormatError) as exc:
            log.error("voice_job_validation_failed", code=exc.code, error=str(exc))
            await self._store.update_status(
                str(msg.job_id), "FAILED", error_msg=str(exc)
            )
            await message.reject(requeue=False)
            return

        # ------------------------------------------------------------------
        # 5. Transcribe
        # ------------------------------------------------------------------
        try:
            transcript = await self._whisper.transcribe(msg.file_path, msg.language)
        except TranscriptionError as exc:
            log.error(
                "voice_transcription_error",
                code=exc.code,
                retryable=exc.retryable,
                error=str(exc),
            )
            await self._store.update_status(
                str(msg.job_id), "FAILED", error_msg=str(exc)
            )
            if exc.retryable:
                await message.nack(requeue=True)
            else:
                await message.reject(requeue=False)
            return

        # ------------------------------------------------------------------
        # 6. Publish result to kms.embed
        # ------------------------------------------------------------------
        result_msg = TranscriptionResultMessage(
            scan_job_id=msg.job_id,
            source_id=msg.source_id,
            user_id=msg.user_id,
            file_path=msg.file_path,
            original_filename=msg.original_filename,
            file_size_bytes=len(transcript.encode()) if transcript else None,
            extracted_text=transcript,
            source_metadata={"language_hint": msg.language, "voice_job_id": str(msg.job_id)},
        )

        try:
            await self._publish_result(result_msg)
        except Exception as exc:
            log.exception("voice_result_publish_failed", error=str(exc))
            # Publishing failure is retryable — nack so the message is reprocessed.
            await self._store.update_status(
                str(msg.job_id), "FAILED", error_msg=f"Publish failed: {exc}"
            )
            await message.nack(requeue=True)
            return

        # ------------------------------------------------------------------
        # 7. Mark job COMPLETED and ack
        # ------------------------------------------------------------------
        await self._store.update_status(
            str(msg.job_id), "COMPLETED", transcript=transcript
        )
        log.info("voice_job_completed", transcript_chars=len(transcript))
        await message.ack()

    def _validate(self, msg: VoiceJobMessage) -> None:
        """Validate file size and MIME type before transcription.

        Args:
            msg: The parsed ``VoiceJobMessage``.

        Raises:
            UnsupportedAudioFormatError: When the MIME type is not supported.
            FileTooLargeError: When the file exceeds the size limit.
        """
        if msg.mime_type not in settings.supported_audio_types:
            raise UnsupportedAudioFormatError(msg.mime_type)

        # Prefer the size from the message; fall back to stat() if available.
        size_bytes: int | None = msg.file_size_bytes
        if size_bytes is None and os.path.exists(msg.file_path):
            size_bytes = os.path.getsize(msg.file_path)

        if size_bytes is not None:
            size_mb = size_bytes / (1024 * 1024)
            if size_mb > settings.max_audio_size_mb:
                raise FileTooLargeError(msg.file_path, size_mb)

    async def _publish_result(self, result: TranscriptionResultMessage) -> None:
        """Publish a ``TranscriptionResultMessage`` to the ``kms.embed`` queue.

        Args:
            result: The transcription result to publish.
        """
        body = result.model_dump_json().encode()
        await self._channel.default_exchange.publish(
            aio_pika.Message(
                body=body,
                content_type="application/json",
            ),
            routing_key=settings.embed_queue,
        )
        logger.info(
            "voice_result_published",
            embed_queue=settings.embed_queue,
            job_id=str(result.scan_job_id),
        )
