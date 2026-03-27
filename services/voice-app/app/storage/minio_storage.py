"""MinIO transcript storage helper.

Uploads transcript text produced by the Whisper transcription worker to a
MinIO (S3-compatible) bucket after transcription completes.  The returned
object key is then stored in ``kms_voice_jobs.transcript_path`` so that
the kms-api can issue pre-signed download URLs without storing full text in
PostgreSQL.

Object key format: ``transcripts/{user_id}/{job_id}.txt``

Usage::

    from app.storage.minio_storage import upload_transcript

    object_key = await upload_transcript(
        job_id=str(msg.job_id),
        user_id=str(msg.user_id),
        text=transcript_text,
    )
    # Store object_key in kms_voice_jobs.transcript_path
"""
from __future__ import annotations

import asyncio
import os
from functools import partial

import boto3
import structlog
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

logger = structlog.get_logger(__name__)

_REGION = "us-east-1"  # Required by boto3; the value is ignored by MinIO.


def _get_s3_client() -> boto3.client:
    """Construct a boto3 S3 client configured to talk to MinIO.

    Reads configuration from environment variables:
    - ``MINIO_ENDPOINT``  (default: ``http://localhost:9000``)
    - ``MINIO_ACCESS_KEY`` (default: ``minioadmin``)
    - ``MINIO_SECRET_KEY`` (default: ``minioadmin``)

    Returns:
        A boto3 S3 client pointing at the MinIO endpoint.
    """
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("MINIO_ENDPOINT", "http://localhost:9000"),
        aws_access_key_id=os.environ.get("MINIO_ACCESS_KEY", "minioadmin"),
        aws_secret_access_key=os.environ.get("MINIO_SECRET_KEY", "minioadmin"),
        config=Config(signature_version="s3v4"),
        region_name=_REGION,
    )


def _ensure_bucket(client: boto3.client, bucket: str) -> None:
    """Create ``bucket`` if it does not already exist.

    Args:
        client: Configured boto3 S3 client.
        bucket: Bucket name to ensure exists.
    """
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code", "")
        if error_code in ("404", "NoSuchBucket"):
            client.create_bucket(Bucket=bucket)
            logger.info("minio_bucket_created", bucket=bucket)
        else:
            raise


def _upload_sync(job_id: str, user_id: str, text: str) -> str:
    """Synchronous MinIO upload — intended to run in a thread pool executor.

    Args:
        job_id: Voice job UUID string (used in the object key).
        user_id: Owning user UUID string (used in the object key).
        text: Full UTF-8 transcript text to store.

    Returns:
        The MinIO object key of the uploaded transcript.

    Raises:
        BotoCoreError: On any boto3/botocore-level failure.
        ClientError: On any S3-protocol-level failure from MinIO.
    """
    bucket = os.environ.get("MINIO_BUCKET", "kms-transcripts")
    object_key = f"transcripts/{user_id}/{job_id}.txt"
    body = text.encode("utf-8")

    client = _get_s3_client()
    _ensure_bucket(client, bucket)

    client.put_object(
        Bucket=bucket,
        Key=object_key,
        Body=body,
        ContentType="text/plain; charset=utf-8",
    )

    logger.info(
        "minio_transcript_uploaded",
        object_key=object_key,
        job_id=job_id,
        bytes=len(body),
    )
    return object_key


async def upload_transcript(job_id: str, user_id: str, text: str) -> str:
    """Upload transcript text to MinIO asynchronously.

    Runs the blocking boto3 call in the default thread pool executor so it
    does not block the asyncio event loop.

    Args:
        job_id: Voice job UUID string (used in the object key).
        user_id: Owning user UUID string (used in the object key).
        text: Full UTF-8 transcript text to store.

    Returns:
        The MinIO object key (``transcripts/{user_id}/{job_id}.txt``).

    Raises:
        BotoCoreError: On any boto3/botocore-level failure.
        ClientError: On any S3-protocol-level failure from MinIO.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,
        partial(_upload_sync, job_id, user_id, text),
    )
