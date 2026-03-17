import json
from uuid import UUID

import aio_pika
import structlog

from app.config import get_settings
from app.connectors.registry import get_connector
from app.models.messages import (
    ScanJobMessage, FileDiscoveredMessage, DedupCheckMessage, ScanJobStatus
)
from app.utils.errors import KMSWorkerError, FileDiscoveryError, ConnectorError, QueuePublishError

logger = structlog.get_logger(__name__)
settings = get_settings()


class ScanHandler:
    """Processes a single scan job message end-to-end."""

    def __init__(self, channel: aio_pika.Channel):
        self._channel = channel

    async def handle(self, message: aio_pika.IncomingMessage) -> None:
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

        await self._update_job_status(job.scan_job_id, ScanJobStatus.PROCESSING)

        try:
            files_count = await self._run_scan(job)
            await self._update_job_status(
                job.scan_job_id, ScanJobStatus.COMPLETED,
                metadata={"files_discovered": files_count},
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
            if e.retryable:
                await message.nack(requeue=True)
            else:
                await message.reject(requeue=False)

        except Exception as e:
            log.error("Unexpected error processing scan job", error=str(e))
            await self._update_job_status(
                job.scan_job_id, ScanJobStatus.FAILED, error=str(e)
            )
            await message.nack(requeue=True)

    async def _run_scan(self, job: ScanJobMessage) -> int:
        connector = get_connector(job.source_type)
        try:
            await connector.connect(job.config)
        except Exception as e:
            raise ConnectorError(str(job.source_type), str(e)) from e

        files_count = 0
        try:
            async for file_msg in connector.list_files(job):
                await self._publish_file_discovered(file_msg)
                if file_msg.checksum_sha256:
                    await self._publish_dedup_check(file_msg)
                files_count += 1

                if files_count % 100 == 0:
                    logger.info(
                        "Scan progress",
                        scan_job_id=str(job.scan_job_id),
                        files_discovered=files_count,
                    )
        except KMSWorkerError:
            raise
        except Exception as e:
            raise FileDiscoveryError(str(job.source_id), str(e)) from e
        finally:
            await connector.disconnect()

        return files_count

    async def _publish_file_discovered(self, msg: FileDiscoveredMessage) -> None:
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
        """Notify kms-api of job status change via HTTP PATCH."""
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
                            "Failed to update job status",
                            job_id=str(job_id),
                            http_status=resp.status,
                            response=body,
                        )
        except Exception as e:
            logger.warning(
                "Could not reach kms-api to update job status",
                job_id=str(job_id),
                error=str(e),
            )
