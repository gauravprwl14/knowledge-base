"""Pydantic models representing transcription jobs.

These are used for API request/response serialisation and internal data
exchange between the endpoint layer and the job store.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums / literals
# ---------------------------------------------------------------------------

JobStatus = Literal["PENDING", "PROCESSING", "COMPLETED", "FAILED"]


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class CreateJobRequest(BaseModel):
    """Request body for POST /api/v1/jobs.

    Attributes:
        file_path: Absolute path to the audio/video file on the server.
        original_filename: Original filename as uploaded by the user.
        mime_type: MIME type of the file (must be an accepted audio/video type).
        user_id: UUID of the user who owns this job.
        source_id: Optional UUID of the KMS source this file belongs to.
        language: BCP-47 language code for transcription (e.g. ``"en"``).
            If omitted, Whisper will auto-detect the language.
        model: Whisper model size to use. Defaults to ``"base"``.
    """

    file_path: str
    original_filename: str
    mime_type: str
    user_id: uuid.UUID
    source_id: uuid.UUID | None = None
    language: str | None = None
    model: str = Field(default="base")


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class CreateJobResponse(BaseModel):
    """Response body for a newly created transcription job.

    Attributes:
        job_id: UUID of the newly created job.
        status: Initial status — always ``"PENDING"``.
        created_at: ISO-8601 timestamp of job creation.
    """

    job_id: uuid.UUID
    status: JobStatus
    created_at: datetime


class TranscriptionJob(BaseModel):
    """Full representation of a transcription job as stored in the database.

    Attributes:
        id: UUID primary key.
        user_id: Owning user UUID.
        source_id: Optional KMS source UUID.
        file_path: Server-side path to the audio/video file.
        original_filename: Original filename as provided by the user.
        mime_type: MIME type of the file.
        status: Current processing status.
        transcript: Transcribed text, populated on ``COMPLETED``.
        language: Detected or specified language code.
        duration_seconds: Duration of the audio in seconds.
        error_msg: Error message if status is ``FAILED``.
        model_used: Whisper model that was used.
        created_at: Timestamp of job creation.
        updated_at: Timestamp of last update.
        completed_at: Timestamp when the job reached a terminal status.
    """

    id: uuid.UUID
    user_id: uuid.UUID
    source_id: uuid.UUID | None = None
    file_path: str
    original_filename: str
    mime_type: str
    status: JobStatus
    transcript: str | None = None
    language: str | None = None
    duration_seconds: float | None = None
    error_msg: str | None = None
    model_used: str = "base"
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class ListJobsResponse(BaseModel):
    """Paginated list of transcription jobs.

    Attributes:
        jobs: List of job objects matching the query.
        total: Total number of jobs (before pagination) for the given filters.
    """

    jobs: list[TranscriptionJob]
    total: int
