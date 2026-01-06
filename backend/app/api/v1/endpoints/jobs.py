from fastapi import APIRouter, HTTPException, status, Query
from typing import Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.dependencies import APIKeyDep, DbSession
from app.schemas.job import JobResponse, JobListResponse, JobStatus as JobStatusSchema
from app.db.models import Job, JobStatus

router = APIRouter()


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
