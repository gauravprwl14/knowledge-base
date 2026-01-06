from fastapi import APIRouter, HTTPException, status, Query
from typing import Optional
from uuid import UUID
import os
import logging

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.dependencies import APIKeyDep, DbSession
from app.schemas.job import JobResponse, JobListResponse, JobStatus as JobStatusSchema
from app.db.models import Job, JobStatus
from app.config import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()


@router.get("", response_model=JobListResponse)
async def list_jobs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: Optional[JobStatusSchema] = None,
    api_key: APIKeyDep = None,
    db: DbSession = None
):
    """List all jobs for the authenticated user."""
    query = select(Job).where(Job.api_key_id == api_key.id)

    if status:
        query = query.where(Job.status == JobStatus(status.value))

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    offset = (page - 1) * page_size
    query = query.order_by(Job.created_at.desc()).offset(offset).limit(page_size)

    result = await db.execute(query)
    jobs = result.scalars().all()

    return JobListResponse(
        jobs=[JobResponse.model_validate(job) for job in jobs],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: UUID,
    api_key: APIKeyDep = None,
    db: DbSession = None
):
    """Get details of a specific job."""
    result = await db.execute(
        select(Job).where(
            Job.id == job_id,
            Job.api_key_id == api_key.id
        )
    )
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )

    return JobResponse.model_validate(job)


@router.delete("/{job_id}")
async def delete_job(
    job_id: UUID,
    api_key: APIKeyDep = None,
    db: DbSession = None
):
    """Delete a job and its associated files."""
    result = await db.execute(
        select(Job).where(
            Job.id == job_id,
            Job.api_key_id == api_key.id
        )
    )
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )

    # If job is processing, cancel it first
    if job.status == JobStatus.PROCESSING:
        job.status = JobStatus.CANCELLED
        await db.commit()
        await db.refresh(job)

    # Delete associated files
    files_deleted = []
    files_failed = []
    
    if job.file_path and os.path.exists(job.file_path):
        try:
            os.remove(job.file_path)
            files_deleted.append(job.file_path)
            logger.info(f"Deleted file: {job.file_path}")
        except Exception as e:
            files_failed.append({"file": job.file_path, "error": str(e)})
            logger.error(f"Failed to delete file {job.file_path}: {e}")

    # Delete processed WAV file if it exists
    processed_path = job.file_path.replace(settings.temp_upload_dir, settings.temp_processed_dir)
    if processed_path.endswith(('.mp4', '.mp3', '.m4a', '.mov', '.avi', '.mkv', '.webm', '.ogg', '.flac')):
        processed_path = os.path.splitext(processed_path)[0] + '.wav'
    
    if os.path.exists(processed_path):
        try:
            os.remove(processed_path)
            files_deleted.append(processed_path)
            logger.info(f"Deleted processed file: {processed_path}")
        except Exception as e:
            files_failed.append({"file": processed_path, "error": str(e)})
            logger.error(f"Failed to delete processed file {processed_path}: {e}")

    # Delete the job from database (cascade will delete transcription)
    await db.delete(job)
    await db.commit()

    return {
        "message": "Job deleted successfully",
        "job_id": str(job_id),
        "files_deleted": files_deleted,
        "files_failed": files_failed
    }


@router.post("/{job_id}/cancel")
async def cancel_job(
    job_id: UUID,
    api_key: APIKeyDep = None,
    db: DbSession = None
):
    """Cancel a pending or processing job."""
    result = await db.execute(
        select(Job).where(
            Job.id == job_id,
            Job.api_key_id == api_key.id
        )
    )
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )

    if job.status in [JobStatus.COMPLETED, JobStatus.CANCELLED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel job with status: {job.status.value}"
        )

    job.status = JobStatus.CANCELLED
    await db.commit()

    return {"message": "Job cancelled", "job_id": str(job_id)}
