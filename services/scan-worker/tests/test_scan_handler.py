"""Tests for ScanHandler — AMQP message processing for scan jobs.

Verifies ack/nack/reject behaviour for happy path, retryable errors,
non-retryable errors, malformed messages, and publish_file_discovered.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.handlers.scan_handler import ScanHandler
from app.models.messages import (
    FileDiscoveredMessage,
    ScanJobMessage,
    ScanJobStatus,
    ScanType,
    SourceType,
)
from app.utils.errors import ConnectorError, ScanJobFailedError


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_scan_job_payload(
    source_type: SourceType = SourceType.LOCAL,
    config: dict | None = None,
) -> dict:
    """Build a minimal valid ScanJobMessage payload dict."""
    return {
        "scan_job_id": str(uuid4()),
        "source_id": str(uuid4()),
        "source_type": source_type.value,
        "user_id": str(uuid4()),
        "scan_type": ScanType.FULL.value,
        "config": config or {"path": "/tmp/test-vault"},
        "retry_count": 0,
    }


def _make_incoming_message(body: bytes) -> MagicMock:
    """Build a mock aio_pika IncomingMessage with async context manager support."""
    msg = MagicMock()
    msg.body = body
    msg.ack = AsyncMock()
    msg.nack = AsyncMock()
    msg.reject = AsyncMock()
    return msg


def _make_channel() -> MagicMock:
    """Build a mock aio_pika Channel with a default_exchange that can publish."""
    exchange = MagicMock()
    exchange.publish = AsyncMock()
    channel = MagicMock()
    channel.default_exchange = exchange
    return channel


# ---------------------------------------------------------------------------
# handle() — happy path
# ---------------------------------------------------------------------------


async def test_handle_valid_message_acks_after_scan():
    """handle() with a well-formed message should run _run_scan and ack the message."""
    channel = _make_channel()
    handler = ScanHandler(channel=channel)

    payload = _make_scan_job_payload()
    message = _make_incoming_message(json.dumps(payload).encode())

    with (
        patch.object(handler, "_run_scan", new=AsyncMock(return_value=5)),
        patch.object(handler, "_update_job_status", new=AsyncMock()),
        patch.object(handler._progress, "set_progress", new=AsyncMock()),
    ):
        await handler.handle(message)

    message.ack.assert_awaited_once()
    message.nack.assert_not_awaited()
    message.reject.assert_not_awaited()


# ---------------------------------------------------------------------------
# handle() — retryable ConnectorError → nack(requeue=True)
# ---------------------------------------------------------------------------


async def test_handle_connector_error_retryable_nacks_with_requeue():
    """ConnectorError with retryable=True should nack with requeue=True."""
    channel = _make_channel()
    handler = ScanHandler(channel=channel)

    payload = _make_scan_job_payload()
    message = _make_incoming_message(json.dumps(payload).encode())

    retryable_error = ConnectorError("local", "temporary IO failure", retryable=True)

    with (
        patch.object(handler, "_run_scan", new=AsyncMock(side_effect=retryable_error)),
        patch.object(handler, "_update_job_status", new=AsyncMock()),
        patch.object(handler._progress, "set_progress", new=AsyncMock()),
    ):
        await handler.handle(message)

    message.nack.assert_awaited_once_with(requeue=True)
    message.ack.assert_not_awaited()
    message.reject.assert_not_awaited()


# ---------------------------------------------------------------------------
# handle() — non-retryable ScanJobFailedError → reject(requeue=False)
# ---------------------------------------------------------------------------


async def test_handle_scan_job_failed_error_rejects_message():
    """ScanJobFailedError (retryable=False) should dead-letter via reject(requeue=False)."""
    channel = _make_channel()
    handler = ScanHandler(channel=channel)

    payload = _make_scan_job_payload()
    message = _make_incoming_message(json.dumps(payload).encode())

    terminal_error = ScanJobFailedError("path does not exist", retryable=False)

    with (
        patch.object(handler, "_run_scan", new=AsyncMock(side_effect=terminal_error)),
        patch.object(handler, "_update_job_status", new=AsyncMock()),
        patch.object(handler._progress, "set_progress", new=AsyncMock()),
    ):
        await handler.handle(message)

    message.reject.assert_awaited_once_with(requeue=False)
    message.ack.assert_not_awaited()
    message.nack.assert_not_awaited()


# ---------------------------------------------------------------------------
# handle() — malformed message → reject(requeue=False)
# ---------------------------------------------------------------------------


async def test_handle_malformed_message_rejects_without_retry():
    """A message with invalid JSON or missing required fields must be dead-lettered."""
    channel = _make_channel()
    handler = ScanHandler(channel=channel)

    # Not valid JSON at all
    message = _make_incoming_message(b"not-valid-json{{{")

    await handler.handle(message)

    message.reject.assert_awaited_once_with(requeue=False)
    message.ack.assert_not_awaited()
    message.nack.assert_not_awaited()


async def test_handle_missing_required_fields_rejects():
    """A message with missing required Pydantic fields should be dead-lettered."""
    channel = _make_channel()
    handler = ScanHandler(channel=channel)

    # Missing scan_job_id, source_id, etc.
    incomplete_payload = {"config": {"path": "/tmp"}}
    message = _make_incoming_message(json.dumps(incomplete_payload).encode())

    await handler.handle(message)

    message.reject.assert_awaited_once_with(requeue=False)
    message.ack.assert_not_awaited()
    message.nack.assert_not_awaited()


# ---------------------------------------------------------------------------
# _publish_file_discovered() — publishes to embed queue
# ---------------------------------------------------------------------------


async def test_publish_file_discovered_publishes_to_embed_queue():
    """_publish_file_discovered() should call channel.default_exchange.publish once."""
    import aio_pika

    channel = _make_channel()
    handler = ScanHandler(channel=channel)

    scan_job_id = uuid4()
    source_id = uuid4()
    user_id = uuid4()

    file_msg = FileDiscoveredMessage(
        scan_job_id=scan_job_id,
        source_id=source_id,
        user_id=user_id,
        file_path="/tmp/test-vault/notes.md",
        original_filename="notes.md",
        mime_type="text/markdown",
        file_size_bytes=1024,
        source_type=SourceType.LOCAL,
    )

    await handler._publish_file_discovered(file_msg)

    channel.default_exchange.publish.assert_awaited_once()
    call_args = channel.default_exchange.publish.call_args
    # First positional arg is the aio_pika.Message; second is routing_key
    published_msg = call_args[0][0]
    assert isinstance(published_msg, aio_pika.Message)
    # Body should be valid JSON containing the file path
    body = json.loads(published_msg.body.decode())
    assert body["file_path"] == "/tmp/test-vault/notes.md"


async def test_publish_file_discovered_raises_queue_publish_error_on_failure():
    """_publish_file_discovered() should raise QueuePublishError when publish fails."""
    from app.utils.errors import QueuePublishError

    channel = _make_channel()
    channel.default_exchange.publish = AsyncMock(side_effect=RuntimeError("broker down"))
    handler = ScanHandler(channel=channel)

    scan_job_id = uuid4()
    source_id = uuid4()
    user_id = uuid4()

    file_msg = FileDiscoveredMessage(
        scan_job_id=scan_job_id,
        source_id=source_id,
        user_id=user_id,
        file_path="/tmp/test-vault/notes.md",
        original_filename="notes.md",
        source_type=SourceType.LOCAL,
    )

    with pytest.raises(QueuePublishError):
        await handler._publish_file_discovered(file_msg)


# ---------------------------------------------------------------------------
# handle() — unexpected exception → nack(requeue=True)
# ---------------------------------------------------------------------------


async def test_handle_unexpected_exception_nacks_with_requeue():
    """An unexpected exception (not KMSWorkerError) should nack with requeue=True."""
    channel = _make_channel()
    handler = ScanHandler(channel=channel)

    payload = _make_scan_job_payload()
    message = _make_incoming_message(json.dumps(payload).encode())

    with (
        patch.object(handler, "_run_scan", new=AsyncMock(side_effect=RuntimeError("unexpected"))),
        patch.object(handler, "_update_job_status", new=AsyncMock()),
        patch.object(handler._progress, "set_progress", new=AsyncMock()),
    ):
        await handler.handle(message)

    message.nack.assert_awaited_once_with(requeue=True)
    message.ack.assert_not_awaited()
    message.reject.assert_not_awaited()
