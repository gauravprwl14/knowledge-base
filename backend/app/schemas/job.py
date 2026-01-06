from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID
from enum import Enum


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobType(str, Enum):
    TRANSCRIPTION = "transcription"
    TRANSLATION = "translation"
    BATCH = "batch"


class JobCreate(BaseModel):
    provider: str = Field(default="whisper", description="Transcription provider")
    model_name: Optional[str] = Field(default=None, description="Model name")
    language: Optional[str] = Field(default=None, description="Source language code")
    target_language: Optional[str] = Field(default=None, description="Target language for translation")
    webhook_url: Optional[str] = Field(default=None, description="Webhook URL for notifications")
    priority: int = Field(default=0, ge=0, le=10, description="Job priority (0-10)")


class JobResponse(BaseModel):
    id: UUID
    status: JobStatus
    job_type: JobType
    provider: Optional[str] = None
    model_name: Optional[str] = None
    language: Optional[str] = None
    target_language: Optional[str] = None
    original_filename: Optional[str] = None
    file_size_bytes: Optional[int] = None
    duration_seconds: Optional[float] = None
    progress: int = 0
    error_message: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class JobListResponse(BaseModel):
    jobs: list[JobResponse]
    total: int
    page: int
    page_size: int
