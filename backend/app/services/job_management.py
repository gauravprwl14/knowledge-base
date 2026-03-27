"""
Job management service for handling bulk operations and file cleanup.
"""

import os
import logging
from typing import List, Dict, Any, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.models import Job, JobStatus, Transcription
from app.config import get_settings
from app.utils.errors import JobErrors, AppException, ErrorType, ErrorCategory, create_error_response

logger = logging.getLogger(__name__)
settings = get_settings()


class JobManagementService:
    """Service for managing job operations including bulk delete"""

    BULK_DELETE_LIMIT = 100  # Maximum jobs that can be deleted at once

    @staticmethod
    async def delete_job_files(job: Job) -> Dict[str, Any]:
        """
        Delete all files associated with a job.

        Args:
            job: Job instance

        Returns:
            Dict with files_deleted and files_failed lists
        """
        files_deleted = []
        files_failed = []

        # Delete original file
        if job.file_path and os.path.exists(job.file_path):
            try:
                os.remove(job.file_path)
                files_deleted.append(job.file_path)
                logger.info(f"Deleted file: {job.file_path}")
            except Exception as e:
                files_failed.append({"file": job.file_path, "error": str(e)})
                logger.error(f"Failed to delete file {job.file_path}: {e}")

        # Delete processed WAV file if it exists
        if job.file_path:
            processed_path = job.file_path.replace(
                settings.temp_upload_dir,
                settings.temp_processed_dir
            )
            
            # Change extension to .wav for processed files
            audio_extensions = (
                '.mp4', '.mp3', '.m4a', '.mov', '.avi',
                '.mkv', '.webm', '.ogg', '.flac'
            )
            if processed_path.endswith(audio_extensions):
                processed_path = os.path.splitext(processed_path)[0] + '.wav'

            if os.path.exists(processed_path):
                try:
                    os.remove(processed_path)
                    files_deleted.append(processed_path)
                    logger.info(f"Deleted processed file: {processed_path}")
                except Exception as e:
                    files_failed.append({"file": processed_path, "error": str(e)})
                    logger.error(f"Failed to delete processed file {processed_path}: {e}")

        return {
            "files_deleted": files_deleted,
            "files_failed": files_failed
        }

    @staticmethod
    async def delete_single_job(
        db: AsyncSession,
        job_id: UUID,
        api_key_id: UUID
    ) -> Dict[str, Any]:
        """
        Delete a single job with all associated data and files.

        Args:
            db: Database session
            job_id: Job UUID
            api_key_id: API key UUID for authorization

        Returns:
            Dict with deletion result

        Raises:
            AppException: If job not found or deletion fails
        """
        # Fetch job with transcription relationship
        result = await db.execute(
            select(Job)
            .options(selectinload(Job.transcription))
            .where(Job.id == job_id, Job.api_key_id == api_key_id)
        )
        job = result.scalar_one_or_none()

        if not job:
            raise AppException(JobErrors.JOB1001)

        # Cancel if processing
        if job.status == JobStatus.PROCESSING:
            job.status = JobStatus.CANCELLED
            await db.commit()
            await db.refresh(job)

        # Delete files
        file_result = await JobManagementService.delete_job_files(job)

        # Delete job (cascade will delete transcription and translations)
        await db.delete(job)
        await db.commit()

        logger.info(f"Job {job_id} deleted successfully")

        return {
            "job_id": str(job_id),
            "original_filename": job.original_filename,
            "status": "deleted",
            **file_result
        }

    @staticmethod
    async def bulk_delete_jobs(
        db: AsyncSession,
        job_ids: List[UUID],
        api_key_id: UUID
    ) -> Dict[str, Any]:
        """
        Delete multiple jobs at once with all associated data and files.

        Args:
            db: Database session
            job_ids: List of job UUIDs
            api_key_id: API key UUID for authorization

        Returns:
            Dict with bulk deletion results

        Raises:
            AppException: If validation fails
        """
        # Validation
        if not job_ids:
            raise AppException(JobErrors.JOB1007)

        if len(job_ids) > JobManagementService.BULK_DELETE_LIMIT:
            raise AppException(
                JobErrors.JOB1008,
                detail=f"Cannot delete more than {JobManagementService.BULK_DELETE_LIMIT} jobs at once"
            )

        # Fetch all jobs
        result = await db.execute(
            select(Job)
            .options(selectinload(Job.transcription))
            .where(Job.id.in_(job_ids), Job.api_key_id == api_key_id)
        )
        jobs = result.scalars().all()

        if not jobs:
            raise AppException(
                JobErrors.JOB1001,
                detail="No matching jobs found for deletion"
            )

        # Track results
        deleted_jobs = []
        failed_jobs = []
        total_files_deleted = []
        total_files_failed = []

        # Create a map of job_ids that were found
        found_job_ids = {job.id for job in jobs}
        
        # Track jobs that were not found
        for requested_job_id in job_ids:
            if requested_job_id not in found_job_ids:
                failed_jobs.append({
                    "errorCode": JobErrors.JOB1001.errorCode,
                    "message": "Job not found or access denied",
                    "type": ErrorType.NOT_FOUND.value,
                    "category": ErrorCategory.RESOURCE.value,
                    "data": {
                        "job_id": str(requested_job_id)
                    }
                })

        # Delete each job
        for job in jobs:
            try:
                # Cancel if processing
                if job.status == JobStatus.PROCESSING:
                    job.status = JobStatus.CANCELLED
                    await db.flush()

                # Delete files
                file_result = await JobManagementService.delete_job_files(job)
                total_files_deleted.extend(file_result["files_deleted"])
                total_files_failed.extend(file_result["files_failed"])

                # Delete from database
                await db.delete(job)
                
                deleted_jobs.append({
                    "job_id": str(job.id),
                    "original_filename": job.original_filename,
                    "status": "deleted"
                })

            except Exception as e:
                logger.error(f"Failed to delete job {job.id}: {e}", exc_info=True)
                # Determine error type
                error_type = ErrorType.DATABASE_ERROR.value
                error_category = ErrorCategory.SYSTEM.value
                error_code = JobErrors.JOB1010.errorCode
                
                if "not found" in str(e).lower():
                    error_type = ErrorType.NOT_FOUND.value
                    error_category = ErrorCategory.RESOURCE.value
                    error_code = JobErrors.JOB1001.errorCode
                elif "constraint" in str(e).lower():
                    error_type = ErrorType.DATABASE_ERROR.value
                    error_category = ErrorCategory.SYSTEM.value
                
                failed_jobs.append({
                    "errorCode": error_code,
                    "message": str(e),
                    "type": error_type,
                    "category": error_category,
                    "data": {
                        "job_id": str(job.id),
                        "original_filename": job.original_filename
                    }
                })

        # Commit all deletions
        try:
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to commit bulk delete: {e}", exc_info=True)
            raise AppException(
                JobErrors.JOB1010,
                detail=f"Database error during bulk delete: {str(e)}"
            )

        # Prepare response
        result = {
            "deleted_count": len(deleted_jobs),
            "failed_count": len(failed_jobs),
            "total_requested": len(job_ids),
            "deleted_jobs": deleted_jobs,
            "failed_jobs": failed_jobs,
            "files_deleted_count": len(total_files_deleted),
            "files_failed_count": len(total_files_failed),
        }

        # Include file details if any failed
        if total_files_failed:
            result["files_failed"] = total_files_failed

        logger.info(
            f"Bulk delete completed: {len(deleted_jobs)} deleted, "
            f"{len(failed_jobs)} failed out of {len(job_ids)} requested"
        )

        return result
