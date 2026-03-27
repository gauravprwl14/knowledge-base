"""Pydantic models for AMQP messages consumed from and published to RabbitMQ queues.

``VoiceJobMessage`` is read from the ``kms.voice`` queue.
``TranscriptionResultMessage`` is published to the ``kms.embed`` queue after a
successful transcription so the embedding pipeline can continue processing.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class VoiceJobMessage(BaseModel):
    """Message consumed from the ``kms.voice`` RabbitMQ queue.

    Attributes:
        job_id: UUID of the voice job record in ``kms_voice_jobs``.
        file_id: UUID of the file record in ``kms_files``.
        source_id: UUID of the KMS source this file belongs to.
        user_id: UUID of the user who triggered the job.
        file_path: Absolute path to the audio/video file on the shared volume.
        original_filename: Original filename as uploaded by the user.
        mime_type: MIME type of the audio file (e.g. ``audio/mpeg``).
        file_size_bytes: Optional raw file size in bytes.
        language: Optional BCP-47 language hint (e.g. ``"en"``). ``None``
            means Whisper should auto-detect the language.
        created_at: Timestamp when the message was created (UTC).
    """

    job_id: UUID
    file_id: UUID
    source_id: UUID
    user_id: UUID
    file_path: str
    original_filename: str
    mime_type: str
    file_size_bytes: Optional[int] = None
    language: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TranscriptionResultMessage(BaseModel):
    """Message published to the ``kms.embed`` queue after successful transcription.

    The structure is intentionally compatible with the embed-worker's expected
    scan-job message format so that no intermediate transformation is needed.

    Attributes:
        scan_job_id: Re-uses the voice ``job_id`` as the embed pipeline job ID.
        source_id: UUID of the KMS source.
        user_id: UUID of the owning user.
        file_path: Path to the original audio file (for traceability).
        original_filename: Original filename.
        mime_type: Set to ``"text/plain"`` since the payload is now plain text.
        file_size_bytes: Optional byte-length of the extracted text.
        extracted_text: The full transcribed text from Whisper.
        source_type: Always ``"voice"`` to identify the originating pipeline.
        source_metadata: Arbitrary key/value bag for extra context
            (e.g. ``detected_language``, ``audio_duration_seconds``).
    """

    scan_job_id: UUID
    source_id: UUID
    user_id: UUID
    file_path: str
    original_filename: str
    mime_type: str = "text/plain"
    file_size_bytes: Optional[int] = None
    extracted_text: str
    source_type: str = "voice"
    source_metadata: dict = Field(default_factory=dict)
