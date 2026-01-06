from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.db.session import Base
from app.db.models.job import JobStatus


class BatchJob(Base):
    __tablename__ = "batch_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    api_key_id = Column(UUID(as_uuid=True), ForeignKey("api_keys.id"), nullable=True)

    name = Column(String(255), nullable=True)
    status = Column(
        SQLEnum(JobStatus, name="job_status", create_type=False),
        default=JobStatus.PENDING
    )

    total_files = Column(Integer, default=0)
    completed_files = Column(Integer, default=0)
    failed_files = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    items = relationship("BatchJobItem", back_populates="batch_job", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<BatchJob {self.id} ({self.status.value})>"


class BatchJobItem(Base):
    __tablename__ = "batch_job_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_job_id = Column(
        UUID(as_uuid=True),
        ForeignKey("batch_jobs.id", ondelete="CASCADE"),
        index=True
    )
    job_id = Column(
        UUID(as_uuid=True),
        ForeignKey("jobs.id", ondelete="CASCADE"),
        index=True
    )

    # Relationships
    batch_job = relationship("BatchJob", back_populates="items")
    job = relationship("Job")

    def __repr__(self):
        return f"<BatchJobItem {self.id}>"
