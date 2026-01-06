from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class TranscriptionResponse(BaseModel):
    id: UUID
    job_id: UUID
    text: str
    language: Optional[str] = None
    confidence: Optional[float] = None
    word_count: Optional[int] = None
    processing_time_ms: Optional[int] = None
    provider: Optional[str] = None
    model_name: Optional[str] = None
    segments: Optional[list] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TranslationRequest(BaseModel):
    target_language: str = Field(..., description="Target language code (e.g., 'es', 'fr', 'de')")
    provider: str = Field(default="openai", description="Translation provider: 'openai' or 'gemini'")


class TranslationResponse(BaseModel):
    id: UUID
    transcription_id: UUID
    source_language: Optional[str] = None
    target_language: str
    translated_text: str
    created_at: datetime

    class Config:
        from_attributes = True


class TranscriptionListResponse(BaseModel):
    transcriptions: list[TranscriptionResponse]
    total: int
    page: int
    page_size: int
