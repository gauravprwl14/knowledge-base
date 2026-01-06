from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum

from app.db.session import Base


class JobStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobType(str, enum.Enum):
    TRANSCRIPTION = "transcription"
    TRANSLATION = "translation"
    BATCH = "batch"


class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    api_key_id = Column(UUID(as_uuid=True), ForeignKey("api_keys.id"), nullable=True)

    status = Column(
        SQLEnum(JobStatus, name="job_status"),
        default=JobStatus.PENDING,
        index=True
    )
    job_type = Column(
        SQLEnum(JobType, name="job_type"),
        nullable=False
    )

    # Transcription settings
    provider = Column(String(50), nullable=True)
    model_name = Column(String(100), nullable=True)
    language = Column(String(10), nullable=True)
    target_language = Column(String(10), nullable=True)  # For translation

    # File info
    file_path = Column(Text, nullable=False)
    original_filename = Column(String(255), nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    duration_seconds = Column(Float, nullable=True)

    # Processing
    priority = Column(Integer, default=0)
    progress = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    webhook_url = Column(Text, nullable=True)
    job_metadata = Column(JSONB, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    transcription = relationship("Transcription", back_populates="job", uselist=False, cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Job {self.id} ({self.status.value})>"
