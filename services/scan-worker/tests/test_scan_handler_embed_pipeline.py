"""Tests for ScanHandler embed-pipeline indexing features.

Covers:
- _publish_embed_job publishes correct payload to kms.embed with PERSISTENT delivery
- _publish_embed_job skips files with status UNSUPPORTED
- _publish_embed_job raises EmbedPublishError when publish fails
- _run_scan queries get_files_pending_embed after each batch upsert
- _run_scan does not publish UNSUPPORTED files to embed queue
- _run_scan accumulates indexed/failed counters correctly
- handle() calls _progress.set_progress with discovered/indexed/failed on completion
- DriveRateLimitError from _run_scan → nack(requeue=True)
- TokenRefreshError from _run_scan → reject(requeue=False)
- ProgressService.set_progress stores discovered/indexed/failed fields in Redis
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import aio_pika
import pytest

from app.handlers.scan_handler import ScanHandler
from app.models.messages import (
    FileDiscoveredMessage,
    ScanJobMessage,
    ScanJobStatus,
    ScanType,
    SourceType,
)
from app.utils.errors import (
    DriveRateLimitError,
    EmbedPublishError,
    TokenRefreshError,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_channel() -> MagicMock:
    exchange = MagicMock()
    exchange.publish = AsyncMock()
    channel = MagicMock()
    channel.default_exchange = exchange
    return channel


def _make_incoming_message(body: bytes) -> MagicMock:
    msg = MagicMock()
    msg.body = body
    msg.ack = AsyncMock()
    msg.nack = AsyncMock()
    msg.reject = AsyncMock()
    return msg


def _make_scan_job_payload(
    source_type: SourceType = SourceType.LOCAL,
    scan_type: ScanType = ScanType.FULL,
) -> dict:
    return {
        "scan_job_id": str(uuid4()),
        "source_id": str(uuid4()),
        "source_type": source_type.value,
        "user_id": str(uuid4()),
        "scan_type": scan_type.value,
        "config": {"path": "/tmp/test"},
        "retry_count": 0,
    }


def _make_file_row(status: str = "PENDING") -> dict:
    return {
        "id": str(uuid4()),
        "external_id": "file123",
        "mime_type": "application/pdf",
        "status": status,
        "checksum_sha256": None,
    }


# ---------------------------------------------------------------------------
# _publish_embed_job
# ---------------------------------------------------------------------------


class TestPublishEmbedJob:
    @pytest.mark.asyncio
    async def test_publishes_correct_payload_to_embed_queue(self):
        """Verify the embed payload contains required fields and routing key."""
        channel = _make_channel()
        handler = ScanHandler(channel)
        job = ScanJobMessage(**{
            "scan_job_id": uuid4(),
            "source_id": uuid4(),
            "user_id": uuid4(),
            "source_type": SourceType.GOOGLE_DRIVE,
            "config": {},
        })
        file_row = _make_file_row("PENDING")

        await handler._publish_embed_job(file_row, job)

        channel.default_exchange.publish.assert_awaited_once()
        call_args = channel.default_exchange.publish.call_args
        msg = call_args[0][0]
        routing_key = call_args[1]["routing_key"]

        assert isinstance(msg, aio_pika.Message)
        assert routing_key == "kms.embed"
        body = json.loads(msg.body.decode())
        assert body["fileId"] == file_row["id"]
        assert body["mimeType"] == "application/pdf"
        assert msg.delivery_mode == aio_pika.DeliveryMode.PERSISTENT

    @pytest.mark.asyncio
    async def test_skips_unsupported_files(self):
        """Files with status UNSUPPORTED must NOT be published."""
        channel = _make_channel()
        handler = ScanHandler(channel)
        job = ScanJobMessage(**{
            "scan_job_id": uuid4(),
            "source_id": uuid4(),
            "user_id": uuid4(),
            "source_type": SourceType.LOCAL,
            "config": {},
        })
        file_row = _make_file_row("UNSUPPORTED")

        await handler._publish_embed_job(file_row, job)

        channel.default_exchange.publish.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_raises_embed_publish_error_on_broker_failure(self):
        """When the broker is down, EmbedPublishError (retryable) is raised."""
        channel = _make_channel()
        channel.default_exchange.publish = AsyncMock(side_effect=RuntimeError("broker down"))
        handler = ScanHandler(channel)
        job = ScanJobMessage(**{
            "scan_job_id": uuid4(),
            "source_id": uuid4(),
            "user_id": uuid4(),
            "source_type": SourceType.LOCAL,
            "config": {},
        })
        file_row = _make_file_row("PENDING")

        with pytest.raises(EmbedPublishError) as exc_info:
            await handler._publish_embed_job(file_row, job)

        assert exc_info.value.retryable is True


# ---------------------------------------------------------------------------
# _run_scan — embed pipeline integration
# ---------------------------------------------------------------------------


class TestRunScanEmbedPipeline:
    @pytest.mark.asyncio
    async def test_run_scan_calls_get_files_pending_embed_after_upsert(self):
        """After each batch upsert, get_files_pending_embed must be queried."""
        channel = _make_channel()
        handler = ScanHandler(channel)
        payload = _make_scan_job_payload()
        job = ScanJobMessage.model_validate(payload)

        file_msg = FileDiscoveredMessage(
            scan_job_id=job.scan_job_id,
            source_id=job.source_id,
            user_id=job.user_id,
            file_path="/tmp/test/note.md",
            external_id="note.md",
            original_filename="note.md",
            mime_type="text/markdown",
            source_type=SourceType.LOCAL,
        )

        async def _fake_list_files(_job):
            yield file_msg

        with (
            patch("app.handlers.scan_handler.get_connector") as mock_registry,
            patch.object(handler._file_sync, "get_source_tokens", new=AsyncMock(return_value=None)),
            patch.object(handler._file_sync, "upsert_files", new=AsyncMock(return_value=1)),
            patch.object(
                handler._file_sync,
                "get_files_pending_embed",
                new=AsyncMock(return_value=[_make_file_row("PENDING")]),
            ) as mock_get_pending,
            patch.object(handler, "_publish_embed_job", new=AsyncMock()),
        ):
            mock_connector = MagicMock()
            mock_connector.connect = AsyncMock()
            mock_connector.disconnect = AsyncMock()
            mock_connector.list_files = _fake_list_files
            mock_registry.return_value = mock_connector

            result = await handler._run_scan(job)

        mock_get_pending.assert_awaited()
        assert result["discovered"] == 1
        assert result["indexed"] == 1

    @pytest.mark.asyncio
    async def test_run_scan_counts_embed_failures(self):
        """Files that fail to publish to embed queue increment the failed counter."""
        channel = _make_channel()
        handler = ScanHandler(channel)
        payload = _make_scan_job_payload()
        job = ScanJobMessage.model_validate(payload)

        file_msg = FileDiscoveredMessage(
            scan_job_id=job.scan_job_id,
            source_id=job.source_id,
            user_id=job.user_id,
            file_path="/tmp/test/note.md",
            external_id="note.md",
            original_filename="note.md",
            source_type=SourceType.LOCAL,
        )

        async def _fake_list_files(_job):
            yield file_msg

        with (
            patch("app.handlers.scan_handler.get_connector") as mock_registry,
            patch.object(handler._file_sync, "upsert_files", new=AsyncMock(return_value=1)),
            patch.object(
                handler._file_sync,
                "get_files_pending_embed",
                new=AsyncMock(return_value=[_make_file_row("PENDING")]),
            ),
            # Simulate a non-fatal publish failure (not EmbedPublishError)
            patch.object(
                handler,
                "_publish_embed_job",
                new=AsyncMock(side_effect=RuntimeError("transient")),
            ),
        ):
            mock_connector = MagicMock()
            mock_connector.connect = AsyncMock()
            mock_connector.disconnect = AsyncMock()
            mock_connector.list_files = _fake_list_files
            mock_registry.return_value = mock_connector

            result = await handler._run_scan(job)

        assert result["discovered"] == 1
        assert result["indexed"] == 0
        assert result["failed"] == 1


# ---------------------------------------------------------------------------
# handle() — DriveRateLimitError and TokenRefreshError routing
# ---------------------------------------------------------------------------


class TestHandleErrorRouting:
    @pytest.mark.asyncio
    async def test_drive_rate_limit_error_nacks_with_requeue(self):
        """DriveRateLimitError (retryable) should nack(requeue=True)."""
        channel = _make_channel()
        handler = ScanHandler(channel)

        payload = _make_scan_job_payload(source_type=SourceType.GOOGLE_DRIVE)
        message = _make_incoming_message(json.dumps(payload).encode())

        rate_limit_err = DriveRateLimitError("src", "quota exceeded")

        with (
            patch.object(handler, "_run_scan", new=AsyncMock(side_effect=rate_limit_err)),
            patch.object(handler, "_update_job_status", new=AsyncMock()),
            patch.object(handler._progress, "set_progress", new=AsyncMock()),
        ):
            await handler.handle(message)

        message.nack.assert_awaited_once_with(requeue=True)
        message.ack.assert_not_awaited()
        message.reject.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_token_refresh_error_rejects_message(self):
        """TokenRefreshError (retryable=False) should reject(requeue=False)."""
        channel = _make_channel()
        handler = ScanHandler(channel)

        payload = _make_scan_job_payload(source_type=SourceType.GOOGLE_DRIVE)
        message = _make_incoming_message(json.dumps(payload).encode())

        token_err = TokenRefreshError("src", "refresh token revoked")

        with (
            patch.object(handler, "_run_scan", new=AsyncMock(side_effect=token_err)),
            patch.object(handler, "_update_job_status", new=AsyncMock()),
            patch.object(handler._progress, "set_progress", new=AsyncMock()),
        ):
            await handler.handle(message)

        message.reject.assert_awaited_once_with(requeue=False)
        message.ack.assert_not_awaited()
        message.nack.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_handle_sets_progress_with_discovered_indexed_failed_on_success(self):
        """On success, set_progress is called with discovered/indexed/failed counts."""
        channel = _make_channel()
        handler = ScanHandler(channel)

        payload = _make_scan_job_payload()
        message = _make_incoming_message(json.dumps(payload).encode())

        with (
            patch.object(
                handler,
                "_run_scan",
                new=AsyncMock(return_value={"discovered": 10, "indexed": 8, "failed": 2}),
            ),
            patch.object(handler, "_update_job_status", new=AsyncMock()),
            patch.object(handler._progress, "set_progress", new=AsyncMock()) as mock_progress,
        ):
            await handler.handle(message)

        message.ack.assert_awaited_once()
        # Find the completion call (last call to set_progress)
        completion_call = mock_progress.call_args_list[-1]
        _, kwargs = completion_call
        assert kwargs.get("discovered") == 10
        assert kwargs.get("indexed") == 8
        assert kwargs.get("failed") == 2


# ---------------------------------------------------------------------------
# ProgressService — new fields
# ---------------------------------------------------------------------------


class TestProgressServiceNewSchema:
    @pytest.mark.asyncio
    async def test_set_progress_stores_discovered_indexed_failed(self):
        """set_progress must serialise discovered/indexed/failed in Redis payload."""
        import json as _json
        from unittest.mock import AsyncMock as AM

        from app.services.progress_service import ProgressService

        svc = ProgressService()
        mock_redis = MagicMock()
        mock_redis.setex = AM()
        svc._redis = mock_redis

        await svc.set_progress(
            "src1", "running",
            discovered=20, indexed=18, failed=2,
        )

        mock_redis.setex.assert_awaited_once()
        stored_json = mock_redis.setex.call_args[0][2]
        data = _json.loads(stored_json)
        assert data["status"] == "running"
        assert data["discovered"] == 20
        assert data["indexed"] == 18
        assert data["failed"] == 2

    @pytest.mark.asyncio
    async def test_set_progress_normalises_completed_to_complete(self):
        """Legacy 'COMPLETED' status string is normalised to 'complete'."""
        import json as _json

        from app.services.progress_service import ProgressService

        svc = ProgressService()
        mock_redis = MagicMock()
        mock_redis.setex = AsyncMock()
        svc._redis = mock_redis

        await svc.set_progress("src1", "COMPLETED")

        stored_json = mock_redis.setex.call_args[0][2]
        data = _json.loads(stored_json)
        assert data["status"] == "complete"

    @pytest.mark.asyncio
    async def test_set_progress_accepts_legacy_files_found_files_added(self):
        """Backward-compat: files_found/files_added map to discovered/indexed."""
        import json as _json

        from app.services.progress_service import ProgressService

        svc = ProgressService()
        mock_redis = MagicMock()
        mock_redis.setex = AsyncMock()
        svc._redis = mock_redis

        await svc.set_progress("src1", "running", files_found=5, files_added=3)

        stored_json = mock_redis.setex.call_args[0][2]
        data = _json.loads(stored_json)
        assert data["discovered"] == 5
        assert data["indexed"] == 3
        # Legacy keys still present for backward compat
        assert data["filesFound"] == 5
        assert data["filesAdded"] == 3
