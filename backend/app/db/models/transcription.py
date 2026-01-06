from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.db.session import Base


class Transcription(Base):
    __tablename__ = "transcriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), index=True)

    text = Column(Text, nullable=False)
    language = Column(String(10), nullable=True)
    confidence = Column(Float, nullable=True)
    word_count = Column(Integer, nullable=True)
    processing_time_ms = Column(Integer, nullable=True)

    provider = Column(String(50), nullable=True)
    model_name = Column(String(100), nullable=True)
    segments = Column(JSONB, nullable=True)  # Timestamp segments if available

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    job = relationship("Job", back_populates="transcription")
    translations = relationship("Translation", back_populates="transcription", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Transcription {self.id}>"


class Translation(Base):
    __tablename__ = "translations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transcription_id = Column(
        UUID(as_uuid=True),
        ForeignKey("transcriptions.id", ondelete="CASCADE"),
        index=True
    )

    source_language = Column(String(10), nullable=True)
    target_language = Column(String(10), nullable=False)
    translated_text = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    transcription = relationship("Transcription", back_populates="translations")

    def __repr__(self):
        return f"<Translation {self.id} ({self.target_language})>"
