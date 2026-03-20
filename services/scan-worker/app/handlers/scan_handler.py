"""Scan job handler — AMQP consumer for the ``kms.scan`` queue.

Processes :class:`~app.models.messages.ScanJobMessage` messages end-to-end:

1. Parse and validate the incoming AMQP message.
2. Set scan progress to ``running`` in Redis.
3. Update the ``kms_scan_jobs`` DB record to ``RUNNING``.
4. Run the connector scan pipeline (:meth:`_run_scan`).
5. After each DB batch-upsert, query which files need embedding and publish
   them to ``kms.embed`` (:meth:`_publish_embed_batch`).
6. Update progress in Redis on every 100-file milestone.
7. On success: ack, update job to ``COMPLETED``, set progress to ``complete``.
8. On retryable error: nack(requeue=True).
9. On terminal error: reject(requeue=False).

Error handling strategy
-----------------------
- Invalid JSON / Pydantic validation failure → ``reject`` (dead-letter).
- :class:`~app.utils.errors.DriveRateLimitError` → ``nack(requeue=True)``.
- :class:`~app.utils.errors.TokenRefreshError` → ``reject(requeue=False)``.
- :class:`~app.utils.errors.KMSWorkerError` retryable=True → ``nack(requeue=True)``.
- :class:`~app.utils.errors.KMSWorkerError` retryable=False → ``reject(requeue=False)``.
- Any other unexpected exception → ``nack(requeue=True)``.
"""
import json
from uuid import UUID

import aio_pika
import structlog

from app.config import get_settings
from app.connectors.registry import get_connector
from app.models.messages import (
    ScanJobMessage, FileDiscoveredMessage, DedupCheckMessage, ScanJobStatus, ScanType, SourceType,
)
from app.services.file_sync_service import FileSyncService
from app.services.progress_service import ProgressService, STATUS_RUNNING, STATUS_COMPLETE, STATUS_FAILED
from app.utils.errors import (
    KMSWorkerError,
    FileDiscoveryError,
    ConnectorError,
    QueuePublishError,
    DriveRateLimitError,
    TokenRefreshError,
    EmbedPublishError,
)

logger = structlog.get_logger(__name__)
settings = get_settings()

_BATCH_SIZE = 50
_PROGRESS_MILESTONE = 100  # update Redis progress every N files


class ScanHandler:
    """Processes a single scan job message end-to-end.

    For Google Drive sources the handler enriches the job config with the
    ``encrypted_tokens`` field read directly from the database so the
    connector can decrypt and use the OAuth2 credentials.

    Pipeline indexing:
        After each batch of files is upserted to ``kms_files``, the handler
        queries which of those files are in a state that requires embedding
        (i.e. not ``INDEXED`` with unchanged content and not ``UNSUPPORTED``)
        and publishes them to the ``kms.embed`` queue.  Files with status
        ``UNSUPPORTED`` or ``INDEXED`` (unchanged) are silently skipped.

    Progress tracking:
        Redis key ``kms:scan:progress:{sourceId}`` is updated with
        ``{ discovered, indexed, failed, status }`` on every batch flush
        and milestone.
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
        """Entry point called by aio_pika for each message on ``kms.scan``.

        Parses the message body as a :class:`~app.models.messages.ScanJobMessage`,
        runs the full scan pipeline, then acks or nacks the message based on the
        outcome.

        Args:
            message: Raw AMQP message from aio_pika.
        """
        try:
            payload = json.loads(message.body)
            job = ScanJobMessage.model_validate(payload)
        except Exception as e:
            logger.error(
                "invalid_scan_job_message_dead_lettering",
                error=str(e),
                body=message.body[:200],
            )
            await message.reject(requeue=False)
            return

        log = logger.bind(scan_job_id=str(job.scan_job_id), source_id=str(job.source_id))
        log.info("scan_job_received", source_type=job.source_type, scan_type=job.scan_type)

        await self._progress.set_progress(str(job.source_id), STATUS_RUNNING)
        await self._update_job_status(job.scan_job_id, ScanJobStatus.RUNNING)

        try:
            result = await self._run_scan(job)
            await self._update_job_status(
                job.scan_job_id,
                ScanJobStatus.COMPLETED,
                metadata={"files_discovered": result["discovered"]},
            )
            await self._progress.set_progress(
                str(job.source_id),
                STATUS_COMPLETE,
                discovered=result["discovered"],
                indexed=result["indexed"],
                failed=result["failed"],
            )
            log.info(
                "scan_job_completed",
                files_discovered=result["discovered"],
                files_indexed=result["indexed"],
                files_failed=result["failed"],
            )
            await message.ack()

        except KMSWorkerError as e:
            log.error(
                "scan_job_failed",
                code=e.code,
                retryable=e.retryable,
                error=str(e),
            )
            await self._update_job_status(
                job.scan_job_id, ScanJobStatus.FAILED, error=str(e)
            )
            await self._progress.set_progress(
                str(job.source_id), STATUS_FAILED, error=str(e)
            )
            if e.retryable:
                await message.nack(requeue=True)
            else:
                await message.reject(requeue=False)

        except Exception as e:
            log.error("scan_job_unexpected_error", error=str(e))
            await self._update_job_status(
                job.scan_job_id, ScanJobStatus.FAILED, error=str(e)
            )
            await self._progress.set_progress(
                str(job.source_id), STATUS_FAILED, error=str(e)
            )
            await message.nack(requeue=True)

    async def _run_scan(self, job: ScanJobMessage) -> dict:
        """Execute the full scan pipeline for a single job.

        For Google Drive sources, enriches the connector config with OAuth2
        tokens loaded from the database before calling the connector.

        For incremental scans on local connectors, preloads existing file
        records so the connector can detect changes without a full re-index.

        After each batch of files is upserted to the DB, queries which files
        need embedding and publishes them to the ``kms.embed`` queue.

        Args:
            job: Validated :class:`~app.models.messages.ScanJobMessage` describing
                the scan to run.

        Returns:
            Dict with keys ``discovered``, ``indexed``, ``failed`` — totals for
            the completed scan.

        Raises:
            ConnectorError: When the connector cannot connect or authenticate.
            FileDiscoveryError: When file listing fails mid-scan.
            DriveRateLimitError: When Google Drive returns HTTP 429.
            TokenRefreshError: When OAuth2 token refresh fails (terminal).
            EmbedPublishError: When publishing to ``kms.embed`` fails.
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
            enriched_config["source_id"] = str(job.source_id)

        connector = get_connector(job.source_type)
        try:
            await connector.connect(enriched_config)
        except KMSWorkerError:
            raise
        except Exception as e:
            raise ConnectorError(str(job.source_type), str(e)) from e

        # For incremental local scans, preload existing records for change detection
        if job.scan_type == ScanType.INCREMENTAL:
            if hasattr(connector, "preload_existing"):
                await connector.preload_existing(str(job.source_id), self._file_sync)

        discovered = 0
        indexed = 0
        failed = 0

        # Accumulate file dicts for batch DB upsert
        batch: list[dict] = []
        # Track external_ids in the current batch for embed query after upsert
        batch_external_ids: list[str] = []

        async def _flush_batch() -> tuple[int, int]:
            """Upsert the current batch to DB and publish eligible files to embed queue.

            Returns:
                Tuple of (indexed_count, failed_count) for the flushed batch.
            """
            nonlocal batch, batch_external_ids
            if not batch:
                return 0, 0

            batch_indexed = 0
            batch_failed = 0
            ext_ids = list(batch_external_ids)

            try:
                await self._file_sync.upsert_files(
                    batch, str(job.source_id), str(job.user_id)
                )
            except Exception as exc:
                logger.error(
                    "batch_upsert_failed",
                    source_id=str(job.source_id),
                    batch_size=len(batch),
                    error=str(exc),
                )
                batch_failed += len(batch)
                batch.clear()
                batch_external_ids.clear()
                return 0, batch_failed

            # Query which of the just-upserted files need embedding
            try:
                embeddable = await self._file_sync.get_files_pending_embed(
                    str(job.source_id), ext_ids
                )
            except Exception as exc:
                logger.warning(
                    "embed_eligibility_query_failed_skipping_publish",
                    source_id=str(job.source_id),
                    error=str(exc),
                )
                embeddable = []

            for file_row in embeddable:
                try:
                    await self._publish_embed_job(file_row, job)
                    batch_indexed += 1
                except EmbedPublishError:
                    raise  # propagate — retryable, entire job nacks
                except Exception as exc:
                    logger.warning(
                        "embed_publish_failed_non_fatal",
                        source_id=str(job.source_id),
                        file_id=file_row.get("id"),
                        error=str(exc),
                    )
                    batch_failed += 1

            batch.clear()
            batch_external_ids.clear()
            return batch_indexed, batch_failed

        try:
            async for file_msg in connector.list_files(job):
                # Dedup check is best-effort (non-blocking)
                if file_msg.checksum_sha256:
                    await self._publish_dedup_check(file_msg)

                discovered += 1

                external_id = file_msg.external_id or file_msg.file_path
                batch.append({
                    "external_id": external_id,
                    "name": file_msg.original_filename,
                    "path": file_msg.file_path,
                    "mime_type": file_msg.mime_type or "application/octet-stream",
                    "size_bytes": file_msg.file_size_bytes,
                    "web_view_link": file_msg.source_metadata.get("web_view_link"),
                    "external_modified_at": file_msg.external_modified_at or file_msg.last_modified,
                    "checksum_sha256": file_msg.checksum_sha256,
                })
                batch_external_ids.append(external_id)

                if len(batch) >= _BATCH_SIZE:
                    batch_indexed, batch_failed = await _flush_batch()
                    indexed += batch_indexed
                    failed += batch_failed

                if discovered % _PROGRESS_MILESTONE == 0:
                    logger.info(
                        "scan_progress_milestone",
                        scan_job_id=str(job.scan_job_id),
                        source_id=str(job.source_id),
                        discovered=discovered,
                        indexed=indexed,
                        failed=failed,
                    )
                    await self._progress.set_progress(
                        str(job.source_id),
                        STATUS_RUNNING,
                        discovered=discovered,
                        indexed=indexed,
                        failed=failed,
                    )

            # Final flush
            batch_indexed, batch_failed = await _flush_batch()
            indexed += batch_indexed
            failed += batch_failed

        except KMSWorkerError:
            raise
        except Exception as e:
            raise FileDiscoveryError(str(job.source_id), str(e)) from e
        finally:
            await connector.disconnect()

        return {"discovered": discovered, "indexed": indexed, "failed": failed}

    async def _publish_embed_job(self, file_row: dict, job: ScanJobMessage) -> None:
        """Publish a single file to the embed queue for indexing.

        Uses the DB row returned by
        :meth:`~app.services.file_sync_service.FileSyncService.get_files_pending_embed`
        to build the embed message.

        Files with status ``UNSUPPORTED`` are silently skipped (already filtered
        by the DB query, but guard is kept for defensive safety).

        Args:
            file_row: Dict with ``id``, ``external_id``, ``mime_type``,
                ``status``, ``checksum_sha256`` from ``kms_files``.
            job: The originating scan job for source/user context.

        Raises:
            EmbedPublishError: When the aio_pika publish call fails.
        """
        if (file_row.get("status") or "").upper() == "UNSUPPORTED":
            return

        embed_payload = {
            "fileId": str(file_row["id"]),
            "sourceId": str(job.source_id),
            "userId": str(job.user_id),
            "mimeType": file_row.get("mime_type", "application/octet-stream"),
            "externalId": file_row.get("external_id"),
            # driveId is the same as externalId for Drive sources
            "driveId": file_row.get("external_id"),
        }
        try:
            await self._channel.default_exchange.publish(
                aio_pika.Message(
                    body=json.dumps(embed_payload).encode(),
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                ),
                routing_key=settings.embed_queue,
            )
        except Exception as exc:
            raise EmbedPublishError(str(file_row.get("id", "?")), str(exc)) from exc

    async def _publish_file_discovered(self, msg: FileDiscoveredMessage) -> None:
        """Publish a FileDiscoveredMessage to the embed queue.

        .. deprecated::
            This method publishes the raw discovery message rather than the
            post-upsert embed job.  It is kept for backward compatibility with
            existing tests.  New code should use :meth:`_publish_embed_job`.

        Args:
            msg: The :class:`~app.models.messages.FileDiscoveredMessage` to publish.

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

        Failures here are logged as warnings and swallowed — dedup is
        non-critical and should not block the embedding pipeline.

        Args:
            msg: The :class:`~app.models.messages.FileDiscoveredMessage` whose
                checksum to submit for deduplication checking.
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
                "dedup_publish_failed_non_fatal",
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
        """Update scan job status via direct DB write (primary) + HTTP fallback.

        Args:
            job_id: UUID of the scan job to update.
            status: Target :class:`~app.models.messages.ScanJobStatus`.
            metadata: Optional dict (e.g. ``{"files_discovered": 42}``).
            error: Optional error message string on failure.
        """
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
                "scan_job_status_db_update_failed_trying_http_fallback",
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
                                "scan_job_status_http_update_failed",
                                job_id=str(job_id),
                                http_status=resp.status,
                                response=body[:200],
                            )
            except Exception as e2:
                logger.warning(
                    "scan_job_status_both_updates_failed",
                    job_id=str(job_id),
                    db_error=str(e),
                    http_error=str(e2),
                )
