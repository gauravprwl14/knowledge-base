from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from typing import Optional
from uuid import uuid4
import os
import aiofiles

from app.dependencies import APIKeyDep, DbSession
from app.schemas.upload import UploadResponse, BatchUploadResponse
from app.db.models import Job, JobType, JobStatus, BatchJob, BatchJobItem
from app.config import get_settings
from app.services.storage.file_storage import FileStorageService

router = APIRouter()
settings = get_settings()
storage_service = FileStorageService()


@router.post("", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    provider: str = Form(default="whisper"),
    model_name: Optional[str] = Form(default=None),
    language: Optional[str] = Form(default=None),
    target_language: Optional[str] = Form(default=None),
    webhook_url: Optional[str] = Form(default=None),
    priority: int = Form(default=0),
    api_key: APIKeyDep = None,
    db: DbSession = None
):
    """Upload a single audio/video file for transcription."""
    # Validate file extension
    if file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()
        if ext not in settings.allowed_extensions_list:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File type '{ext}' not allowed. Allowed: {settings.allowed_extensions}"
            )

    # Check file size (read content length or stream)
    content = await file.read()
    file_size = len(content)

    if file_size > settings.max_file_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size: {settings.max_file_size_mb}MB"
        )

    # Save file to temp storage
    file_id = str(uuid4())
    file_path = await storage_service.save_upload(file_id, file.filename or "audio.wav", content)

    # Create job record
    job = Job(
        api_key_id=api_key.id,
        job_type=JobType.TRANSCRIPTION,
        status=JobStatus.PENDING,
        provider=provider,
        model_name=model_name,
        language=language,
        target_language=target_language,
        file_path=file_path,
        original_filename=file.filename,
        file_size_bytes=file_size,
        webhook_url=webhook_url,
        priority=priority
    )

    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Queue the job for processing
    from app.services.job_service import JobService
    job_service = JobService()
    try:
        await job_service.queue_job(job)
        # Update status to QUEUED to indicate it's in the queue
        job.status = JobStatus.QUEUED
        await db.commit()
    except Exception as e:
        # If queueing fails, mark job as failed
        job.status = JobStatus.FAILED
        job.error_message = f"Failed to queue job: {str(e)}"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to queue job for processing: {str(e)}"
        )
    finally:
        await job_service.close()

    return UploadResponse(
        job_id=job.id,
        filename=file.filename or "audio.wav",
        file_size_bytes=file_size,
        status="queued",
        message="File uploaded successfully and queued for processing"
    )


@router.post("/batch", response_model=BatchUploadResponse)
async def upload_batch(
    files: list[UploadFile] = File(...),
    provider: str = Form(default="whisper"),
    model_name: Optional[str] = Form(default=None),
    language: Optional[str] = Form(default=None),
    target_language: Optional[str] = Form(default=None),
    webhook_url: Optional[str] = Form(default=None),
    priority: int = Form(default=0),
    batch_name: Optional[str] = Form(default=None),
    api_key: APIKeyDep = None,
    db: DbSession = None
):
    """Upload multiple audio/video files for batch transcription."""
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided"
        )

    # Create batch job
    batch_job = BatchJob(
        api_key_id=api_key.id,
        name=batch_name or f"Batch {len(files)} files",
        status=JobStatus.PENDING,
        total_files=len(files)
    )
    db.add(batch_job)
    await db.flush()

    uploaded_jobs = []

    for file in files:
        # Validate file extension
        if file.filename:
            ext = file.filename.rsplit(".", 1)[-1].lower()
            if ext not in settings.allowed_extensions_list:
                continue  # Skip invalid files in batch

        # Read and check size
        content = await file.read()
        file_size = len(content)

        if file_size > settings.max_file_size_bytes:
            continue  # Skip oversized files

        # Save file
        file_id = str(uuid4())
        file_path = await storage_service.save_upload(file_id, file.filename or "audio.wav", content)

        # Create job record
        job = Job(
            api_key_id=api_key.id,
            job_type=JobType.TRANSCRIPTION,
            status=JobStatus.PENDING,
            provider=provider,
            model_name=model_name,
            language=language,
            target_language=target_language,
            file_path=file_path,
            original_filename=file.filename,
            file_size_bytes=file_size,
            webhook_url=webhook_url,
            priority=priority
        )
        db.add(job)
        await db.flush()

        # Link to batch
        batch_item = BatchJobItem(
            batch_job_id=batch_job.id,
            job_id=job.id
        )
        db.add(batch_item)

        uploaded_jobs.append(UploadResponse(
            job_id=job.id,
            filename=file.filename or "audio.wav",
            file_size_bytes=file_size,
            status="pending"
        ))

        # Queue the job
        from app.services.job_service import JobService
        job_service = JobService()
        try:
            await job_service.queue_job(job)
            job.status = JobStatus.QUEUED
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error_message = f"Failed to queue job: {str(e)}"
            batch_job.failed_files += 1
        finally:
            await job_service.close()

    await db.commit()
    await db.refresh(batch_job)

    return BatchUploadResponse(
        batch_id=batch_job.id,
        total_files=len(uploaded_jobs),
        jobs=uploaded_jobs,
        status="queued",
        message=f"{len(uploaded_jobs)} files uploaded and queued for processing"
    )
