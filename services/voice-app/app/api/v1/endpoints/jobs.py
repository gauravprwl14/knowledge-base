"""Transcription job endpoints.

Provides:
- ``POST /api/v1/jobs``  — create a new transcription job
- ``GET  /api/v1/jobs/{job_id}`` — get a single job
- ``GET  /api/v1/jobs`` — list jobs for a user (paginated)
"""
from __future__ import annotations

import uuid
from typing import Annotated

import structlog
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import JSONResponse

from app.models.job import (
    CreateJobRequest,
    CreateJobResponse,
    JobStatus,
    ListJobsResponse,
    TranscriptionJob,
)
from app.services import job_store
from app.utils.errors import JobNotFoundError

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=CreateJobResponse,
    summary="Create a transcription job",
    description="Enqueue a new audio/video file for transcription. The job starts as PENDING and is picked up by the background consumer.",
)
async def create_job(body: CreateJobRequest) -> JSONResponse:
    """Create a new PENDING transcription job.

    Args:
        body: Request body with file metadata and optional language/model hints.

    Returns:
        201 response containing ``job_id``, ``status``, and ``created_at``.
    """
    log = logger.bind(user_id=str(body.user_id), file_path=body.file_path)
    log.info("Creating transcription job")

    job_id = await job_store.create_job(
        user_id=body.user_id,
        source_id=body.source_id,
        file_path=body.file_path,
        original_filename=body.original_filename,
        mime_type=body.mime_type,
        language=body.language,
        model=body.model,
    )

    # Fetch the full row to get created_at from the DB
    job = await job_store.get_job(job_id)
    assert job is not None  # just inserted

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=CreateJobResponse(
            job_id=job.id,
            status=job.status,
            created_at=job.created_at,
        ).model_dump(mode="json"),
    )


@router.get(
    "/{job_id}",
    response_model=TranscriptionJob,
    summary="Get a transcription job",
    description="Return the full state of a transcription job by its UUID.",
)
async def get_job(job_id: uuid.UUID) -> JSONResponse:
    """Fetch a transcription job by its UUID.

    Args:
        job_id: UUID path parameter identifying the job.

    Returns:
        200 with the full :class:`~app.models.job.TranscriptionJob` payload.

    Raises:
        HTTPException: 404 if no job exists with the given UUID.
    """
    try:
        job = await job_store.get_job(job_id)
        if job is None:
            raise JobNotFoundError(str(job_id))
    except JobNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc

    return JSONResponse(job.model_dump(mode="json"))


@router.get(
    "",
    response_model=ListJobsResponse,
    summary="List transcription jobs",
    description="Return a paginated list of transcription jobs for the specified user.",
)
async def list_jobs(
    user_id: Annotated[uuid.UUID, Query(description="Filter jobs by owning user UUID")],
    job_status: Annotated[
        JobStatus | None,
        Query(alias="status", description="Optional status filter"),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
    offset: Annotated[int, Query(ge=0, description="Page offset")] = 0,
) -> JSONResponse:
    """List transcription jobs for a user with optional status filter.

    Args:
        user_id: Required query parameter — owner's UUID.
        job_status: Optional status filter.
        limit: Page size (1–100, default 20).
        offset: Record offset for pagination (default 0).

    Returns:
        200 with ``{ jobs: [...], total: int }``.
    """
    jobs, total = await job_store.list_jobs(
        user_id=user_id,
        status=job_status,
        limit=limit,
        offset=offset,
    )
    return JSONResponse(
        ListJobsResponse(jobs=jobs, total=total).model_dump(mode="json")
    )
