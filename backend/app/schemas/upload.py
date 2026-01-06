from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID


class UploadRequest(BaseModel):
    provider: str = Field(default="whisper", description="Transcription provider")
    model_name: Optional[str] = Field(default=None, description="Model name")
    language: Optional[str] = Field(default=None, description="Source language code")
    target_language: Optional[str] = Field(default=None, description="Target language for translation")
    webhook_url: Optional[str] = Field(default=None, description="Webhook URL for notifications")
    priority: int = Field(default=0, ge=0, le=10, description="Job priority")


class UploadResponse(BaseModel):
    job_id: UUID
    filename: str
    file_size_bytes: int
    status: str = "pending"
    message: str = "File uploaded successfully and queued for processing"


class BatchUploadResponse(BaseModel):
    batch_id: UUID
    total_files: int
    jobs: list[UploadResponse]
    status: str = "pending"
    message: str = "Files uploaded successfully and queued for processing"
