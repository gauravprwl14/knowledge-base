import json
from uuid import UUID

import aio_pika
import structlog

from app.config import get_settings
from app.connectors.registry import get_connector
from app.models.messages import (
    ScanJobMessage, FileDiscoveredMessage, DedupCheckMessage, ScanJobStatus, ScanType, SourceType
)
from app.services.file_sync_service import FileSyncService
from app.services.progress_service import ProgressService
from app.utils.errors import KMSWorkerError, FileDiscoveryError, ConnectorError, QueuePublishError

logger = structlog.get_logger(__name__)
settings = get_settings()


class ScanHandler:
    """Processes a single scan job message end-to-end.

    For Google Drive sources the handler enriches the job config with the
    ``encrypted_tokens`` field read directly from the database so that the
    connector can decrypt and use the OAuth2 credentials.
    """

    def __init__(self, channel: aio_pika.Channel) -> None:
        """Initialise the handler with a shared aio_pika channel.

        Args:
            channel: An open aio_pika channel used to publish downstream
                messages to the embed and dedup queues.
        """
        self._channel = channel
        self._file_sync = FileSyncService()
        self._progress = ProgressService()

    async def handle(self, message: aio_pika.IncomingMessage) -> None:
        """Entry point called by aio_pika for each message on kms.scan.

        Parses the message body as a :class:`ScanJobMessage`, runs the full
        scan pipeline, then acks or nacks the message based on the outcome.

        Error handling strategy:
        - Invalid JSON / schema validation failure → reject (dead-letter, no retry).
        - :class:`KMSWorkerError` with ``retryable=True`` → nack (requeue).
        - :class:`KMSWorkerError` with ``retryable=False`` → reject (dead-letter).
        - Unexpected exception → nack (requeue; may eventually reach DLQ).

        Args:
            message: Raw AMQP message from aio_pika.
        """
        try:
            payload = json.loads(message.body)
            job = ScanJobMessage.model_validate(payload)
        except Exception as e:
            logger.error(
                "Invalid scan job message — dead-lettering",
                error=str(e),
                body=message.body[:200],
            )
            await message.reject(requeue=False)
            return

        log = logger.bind(scan_job_id=str(job.scan_job_id), source_id=str(job.source_id))
        log.info("Processing scan job", source_type=job.source_type)

        await self._progress.set_progress(str(job.source_id), "RUNNING")
        await self._update_job_status(job.scan_job_id, ScanJobStatus.RUNNING)

        try:
            files_count = await self._run_scan(job)
            await self._update_job_status(
                job.scan_job_id, ScanJobStatus.COMPLETED,
                metadata={"files_discovered": files_count},
            )
            await self._progress.set_progress(
                str(job.source_id), "COMPLETED",
                files_found=files_count,
            )
            log.info("Scan job completed", files_discovered=files_count)
            await message.ack()

        except KMSWorkerError as e:
            log.error(
                "Scan job failed",
                code=e.code,
                retryable=e.retryable,
                error=str(e),
            )
            await self._update_job_status(
                job.scan_job_id, ScanJobStatus.FAILED, error=str(e)
            )
            await self._progress.set_progress(str(job.source_id), "FAILED", error=str(e))
            if e.retryable:
                await message.nack(requeue=True)
            else:
                await message.reject(requeue=False)

        except Exception as e:
            log.error("Unexpected error processing scan job", error=str(e))
            await self._update_job_status(
                job.scan_job_id, ScanJobStatus.FAILED, error=str(e)
            )
            await self._progress.set_progress(str(job.source_id), "FAILED", error=str(e))
            await message.nack(requeue=True)

    async def _run_scan(self, job: ScanJobMessage) -> int:
        """Execute the full scan pipeline for a single job.

        For Google Drive sources, enriches the connector config with OAuth2
        tokens loaded from the database before calling the connector.

        For incremental scans, preloads existing file records so the connector
        can detect changes without a full re-index.

        Args:
            job: Validated :class:`ScanJobMessage` describing the scan to run.

        Returns:
            int: Total number of files discovered during the scan.

        Raises:
            ConnectorError: When the connector cannot connect or authenticate.
            FileDiscoveryError: When file listing fails mid-scan.
        """
        # Enrich config for Google Drive: load encrypted tokens from DB
        enriched_config = dict(job.config)
        if job.source_type == SourceType.GOOGLE_DRIVE:
            encrypted = await self._file_sync.get_source_tokens(str(job.source_id))
            if not encrypted:
                raise ConnectorError(
                    "google_drive",
                    "No encrypted_tokens in DB — reconnect Google Drive",
                    retryable=False,
                )
            enriched_config["encrypted_tokens"] = encrypted

        connector = get_connector(job.source_type)
        try:
            await connector.connect(enriched_config)
        except KMSWorkerError:
            raise
        except Exception as e:
            raise ConnectorError(str(job.source_type), str(e)) from e

        # For incremental scans, preload existing file records for change detection
        if job.scan_type == ScanType.INCREMENTAL:
            if hasattr(connector, "preload_existing"):
                await connector.preload_existing(str(job.source_id), self._file_sync)

        files_count = 0
        batch: list[dict] = []
        BATCH_SIZE = 50

        async def _flush_batch() -> None:
            if batch:
                await self._file_sync.upsert_files(batch, str(job.source_id), str(job.user_id))
                batch.clear()

        try:
            async for file_msg in connector.list_files(job):
                await self._publish_file_discovered(file_msg)
                if file_msg.checksum_sha256:
                    await self._publish_dedup_check(file_msg)
                files_count += 1

                # Collect for batch DB upsert
                batch.append({
                    "external_id": file_msg.external_id or file_msg.file_path,
                    "name": file_msg.original_filename,
                    "path": file_msg.file_path,
                    "mime_type": file_msg.mime_type or "application/octet-stream",
                    "size_bytes": file_msg.file_size_bytes,
                    "web_view_link": None,
                    "external_modified_at": file_msg.external_modified_at,
                    "checksum_sha256": file_msg.checksum_sha256,
                })
                if len(batch) >= BATCH_SIZE:
                    await _flush_batch()

                if files_count % 100 == 0:
                    logger.info(
                        "Scan progress",
                        scan_job_id=str(job.scan_job_id),
                        files_discovered=files_count,
                    )
                    await self._progress.set_progress(
                        str(job.source_id), "RUNNING",
                        files_found=files_count,
                    )

            await _flush_batch()  # Final flush
        except KMSWorkerError:
            raise
        except Exception as e:
            raise FileDiscoveryError(str(job.source_id), str(e)) from e
        finally:
            await connector.disconnect()

        return files_count

    async def _publish_file_discovered(self, msg: FileDiscoveredMessage) -> None:
        """Publish a FileDiscoveredMessage to the embed queue.

        Args:
            msg: The :class:`FileDiscoveredMessage` to publish.

        Raises:
            QueuePublishError: If the aio_pika publish call fails.
        """
        try:
            await self._channel.default_exchange.publish(
                aio_pika.Message(
                    body=msg.model_dump_json().encode(),
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                ),
                routing_key=settings.embed_queue,
            )
        except Exception as e:
            raise QueuePublishError(settings.embed_queue, str(e)) from e

    async def _publish_dedup_check(self, msg: FileDiscoveredMessage) -> None:
        """Publish a DedupCheckMessage to the dedup queue (best-effort).

        Failures here are logged as warnings and swallowed — dedup is non-critical
        and should not block the embedding pipeline.

        Args:
            msg: The :class:`FileDiscoveredMessage` whose checksum to submit for
                deduplication checking.
        """
        try:
            dedup_msg = DedupCheckMessage(
                file_path=msg.file_path,
                checksum_sha256=msg.checksum_sha256,
                source_id=msg.source_id,
                user_id=msg.user_id,
                file_size_bytes=msg.file_size_bytes,
            )
            await self._channel.default_exchange.publish(
                aio_pika.Message(
                    body=dedup_msg.model_dump_json().encode(),
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                ),
                routing_key=settings.dedup_queue,
            )
        except Exception as e:
            logger.warning(
                "Failed to publish dedup check — non-fatal",
                error=str(e),
                file_path=msg.file_path,
            )

    async def _update_job_status(
        self,
        job_id: UUID,
        status: ScanJobStatus,
        metadata: dict | None = None,
        error: str | None = None,
    ) -> None:
        """Update scan job status via direct DB write (primary) + HTTP fallback."""
        files_found = metadata.get("files_discovered", 0) if metadata else 0
        try:
            await self._file_sync.update_scan_job(
                str(job_id),
                status.value,
                files_found=files_found,
                error_msg=error,
            )
        except Exception as e:
            logger.warning(
                "Could not update job status via DB — trying HTTP fallback",
                job_id=str(job_id),
                error=str(e),
            )
            # HTTP fallback
            import aiohttp
            url = f"{settings.kms_api_url}/api/v1/scan-jobs/{job_id}/status"
            payload: dict = {"status": status.value}
            if metadata:
                payload["metadata"] = metadata
            if error:
                payload["errorMessage"] = error
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.patch(
                        url, json=payload, timeout=aiohttp.ClientTimeout(total=10)
                    ) as resp:
                        if resp.status not in (200, 204):
                            body = await resp.text()
                            logger.warning(
                                "HTTP status update also failed",
                                job_id=str(job_id),
                                http_status=resp.status,
                                response=body[:200],
                            )
            except Exception as e2:
                logger.warning(
                    "Both DB and HTTP status updates failed",
                    job_id=str(job_id),
                    db_error=str(e),
                    http_error=str(e2),
                )
