"""Background asyncio task that polls for PENDING transcription jobs and processes them.

The consumer runs as a long-lived asyncio task launched from the FastAPI
lifespan. It polls every ``poll_interval_seconds`` seconds, picks up to
``max_concurrent_jobs`` PENDING jobs, and processes each sequentially
(parallel processing can be added by switching to ``asyncio.gather``).
"""
from __future__ import annotations

import asyncio

import structlog

from app.config import get_settings
from app.services import job_store, transcription_service as ts_module

logger = structlog.get_logger(__name__)

_transcription_service: ts_module.TranscriptionService | None = None


def get_transcription_service() -> ts_module.TranscriptionService:
    """Return the shared TranscriptionService instance, creating it if needed.

    Returns:
        The singleton :class:`~app.services.transcription_service.TranscriptionService`.
    """
    global _transcription_service
    if _transcription_service is None:
        settings = get_settings()
        _transcription_service = ts_module.TranscriptionService(
            default_model=settings.whisper_model
        )
    return _transcription_service


async def _process_job(job: "job_store.TranscriptionJob") -> None:
    """Process a single transcription job end-to-end.

    Sets the job to COMPLETED with the transcript on success, or FAILED
    with an error message on any exception.

    Args:
        job: The transcription job to process (must be in PROCESSING state).
    """
    log = logger.bind(job_id=str(job.id), file_path=job.file_path)
    service = get_transcription_service()

    try:
        log.info("Processing transcription job")
        result = await service.transcribe(
            file_path=job.file_path,
            language=job.language,
            model=job.model_used,
        )
        await job_store.update_job_status(
            job.id,
            "COMPLETED",
            transcript=result.text,
            language=result.language,
            duration_seconds=result.duration_seconds,
        )
        log.info(
            "Job completed",
            language=result.language,
            duration_seconds=result.duration_seconds,
        )

    except Exception as exc:
        log.error("Job failed", error=str(exc))
        await job_store.update_job_status(
            job.id,
            "FAILED",
            error_msg=str(exc),
        )


async def run_consumer() -> None:
    """Poll continuously for PENDING jobs and process them.

    Runs until cancelled (e.g. on FastAPI lifespan shutdown).
    Polls every ``poll_interval_seconds`` seconds and claims up to
    ``max_concurrent_jobs`` jobs per cycle.
    """
    settings = get_settings()
    log = logger.bind(
        poll_interval=settings.poll_interval_seconds,
        max_jobs=settings.max_concurrent_jobs,
    )
    log.info("Job consumer started")

    while True:
        try:
            jobs = await job_store.claim_pending_jobs(limit=settings.max_concurrent_jobs)
            if jobs:
                log.info("Claimed pending jobs", count=len(jobs))
                for job in jobs:
                    await _process_job(job)
        except asyncio.CancelledError:
            log.info("Job consumer shutting down")
            raise
        except Exception as exc:
            log.error("Consumer poll error", error=str(exc))

        await asyncio.sleep(settings.poll_interval_seconds)
