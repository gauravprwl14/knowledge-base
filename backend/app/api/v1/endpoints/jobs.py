from fastapi import APIRouter, HTTPException, status, Query
from typing import Optional
from uuid import UUID
import os
import logging

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.dependencies import APIKeyDep, DbSession
from app.schemas.job import JobResponse, JobListResponse, JobStatus as JobStatusSchema
from app.schemas.bulk import BulkDeleteRequest, BulkDeleteResponse
from app.db.models import Job, JobStatus
from app.config import get_settings
from app.services.job_management import JobManagementService
from app.utils.errors import JobErrors, AppException

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
        raise AppException(JobErrors.JOB1001)

    return JobResponse.model_validate(job)


@router.delete("/{job_id}")
async def delete_job(
    job_id: UUID,
    api_key: APIKeyDep = None,
    db: DbSession = None
):
    """Delete a job and its associated files."""
    try:
        result = await JobManagementService.delete_single_job(
            db=db,
            job_id=job_id,
            api_key_id=api_key.id
        )
        return {
            "message": "Job deleted successfully",
            **result
        }
    except AppException as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail
        )


@router.post(
    "/bulk/delete",
    response_model=BulkDeleteResponse,
    summary="Bulk Delete Jobs",
    description="""
    Delete multiple jobs at once with all associated data and files.
    
    **Features:**
    - Delete 1-100 jobs in a single request
    - Automatically cancels processing jobs before deletion
    - Deletes associated files (audio, transcription, translation)
    - Returns detailed success/failure breakdown
    
    **Partial Success Handling:**
    When some jobs fail to delete (e.g., invalid job ID, database errors), the endpoint:
    - Returns HTTP 200 with detailed breakdown
    - Provides `deleted_count` and `failed_count`
    - Lists successfully deleted jobs in `deleted_jobs`
    - Lists failed jobs with error messages in `failed_jobs`
    - Commits successful deletions even if some fail
    
    **Example Scenarios:**
    1. All 10 jobs deleted successfully: `deleted_count=10, failed_count=0`
    2. 8 jobs deleted, 2 failed: `deleted_count=8, failed_count=2` with error details
    3. No matching jobs found: Returns error `JOB1001`
    
    **Error Codes:**
    - `JOB1001`: Job not found (all jobs not found)
    - `JOB1007`: Empty job list
    - `JOB1008`: Limit exceeded (>100 jobs)
    - `JOB1010`: Database error
    """,
    responses={
        200: {
            "description": "Successful bulk delete (may include partial failures)",
            "content": {
                "application/json": {
                    "examples": {
                        "all_success": {
                            "summary": "All jobs deleted successfully",
                            "value": {
                                "deleted_count": 10,
                                "failed_count": 0,
                                "total_requested": 10,
                                "deleted_jobs": [
                                    {
                                        "job_id": "550e8400-e29b-41d4-a716-446655440000",
                                        "original_filename": "audio1.mp3",
                                        "status": "deleted"
                                    },
                                    {
                                        "job_id": "550e8400-e29b-41d4-a716-446655440001",
                                        "original_filename": "audio2.mp3",
                                        "status": "deleted"
                                    }
                                ],
                                "failed_jobs": [],
                                "files_deleted_count": 30,
                                "files_failed_count": 0
                            }
                        },
                        "partial_success": {
                            "summary": "Partial success - 8 deleted, 2 failed",
                            "value": {
                                "deleted_count": 8,
                                "failed_count": 2,
                                "total_requested": 10,
                                "deleted_jobs": [
                                    {
                                        "job_id": "550e8400-e29b-41d4-a716-446655440000",
                                        "original_filename": "audio1.mp3",
                                        "status": "deleted"
                                    },
                                    {
                                        "job_id": "550e8400-e29b-41d4-a716-446655440001",
                                        "original_filename": "audio2.mp3",
                                        "status": "deleted"
                                    }
                                ],
                                "failed_jobs": [
                                    {
                                        "errorCode": "JOB1001",
                                        "message": "Job not found or access denied",
                                        "type": "not_found",
                                        "category": "resource",
                                        "data": {
                                            "job_id": "550e8400-e29b-41d4-a716-446655440008",
                                            "original_filename": "audio9.mp3"
                                        }
                                    },
                                    {
                                        "errorCode": "JOB1010",
                                        "message": "Database constraint violation",
                                        "type": "database_error",
                                        "category": "system",
                                        "data": {
                                            "job_id": "550e8400-e29b-41d4-a716-446655440009",
                                            "original_filename": "audio10.mp3"
                                        }
                                    }
                                ],
                                "files_deleted_count": 24,
                                "files_failed_count": 2
                            }
                        }
                    }
                }
            }
        },
        400: {
            "description": "Validation error",
            "content": {
                "application/json": {
                    "examples": {
                        "empty_list": {
                            "summary": "Empty job list",
                            "value": {
                                "errors": [{
                                    "errorCode": "JOB1007",
                                    "statusCode": 400,
                                    "message": "Job list cannot be empty",
                                    "type": "validation_error",
                                    "category": "input_validation"
                                }]
                            }
                        },
                        "limit_exceeded": {
                            "summary": "Limit exceeded (>100 jobs)",
                            "value": {
                                "errors": [{
                                    "errorCode": "JOB1008",
                                    "statusCode": 400,
                                    "message": "Cannot delete more than 100 jobs at once",
                                    "type": "validation_error",
                                    "category": "business_rule_violation"
                                }]
                            }
                        }
                    }
                }
            }
        },
        401: {
            "description": "Unauthorized - Invalid or missing API key",
            "content": {
                "application/json": {
                    "example": {
                        "detail": "Invalid API key"
                    }
                }
            }
        },
        404: {
            "description": "No matching jobs found",
            "content": {
                "application/json": {
                    "example": {
                        "errors": [{
                            "errorCode": "JOB1001",
                            "statusCode": 404,
                            "message": "No matching jobs found for deletion",
                            "type": "not_found",
                            "category": "resource"
                        }]
                    }
                }
            }
        },
        500: {
            "description": "Database or server error",
            "content": {
                "application/json": {
                    "example": {
                        "errors": [{
                            "errorCode": "JOB1010",
                            "statusCode": 500,
                            "message": "Database error during bulk delete",
                            "type": "database_error",
                            "category": "system"
                        }]
                    }
                }
            }
        }
    },
    tags=["Jobs - Bulk Operations"]
)
async def bulk_delete_jobs(
    request: BulkDeleteRequest,
    api_key: APIKeyDep = None,
    db: DbSession = None
):
    """
    Bulk delete endpoint - handles partial success gracefully.
    
    The endpoint processes all job IDs and returns detailed results.
    Even if some jobs fail, successful deletions are committed.
    """
    try:
        result = await JobManagementService.bulk_delete_jobs(
            db=db,
            job_ids=request.job_ids,
            api_key_id=api_key.id
        )
        return result
    except AppException as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail
        )


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
        raise AppException(JobErrors.JOB1001)

    if job.status in [JobStatus.COMPLETED, JobStatus.CANCELLED]:
        raise AppException(
            JobErrors.JOB1003,
            detail=f"Cannot cancel job with status: {job.status.value}"
        )

    job.status = JobStatus.CANCELLED
    await db.commit()

    return {"message": "Job cancelled", "job_id": str(job_id)}
