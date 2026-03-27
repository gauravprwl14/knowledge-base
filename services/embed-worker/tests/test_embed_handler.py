"""Tests for EmbedHandler message processing."""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.handlers.embed_handler import EmbedHandler
from app.utils.errors import ExtractionError


def _make_valid_payload(**overrides) -> dict:
    """Build a minimal valid FileDiscoveredMessage payload dict.

    Args:
        **overrides: Any fields to override in the default payload.

    Returns:
        Dictionary that passes FileDiscoveredMessage validation.
    """
    base = {
        "scan_job_id": str(uuid.uuid4()),
        "source_id": str(uuid.uuid4()),
        "user_id": str(uuid.uuid4()),
        "file_path": "/tmp/test.txt",
        "original_filename": "test.txt",
        "mime_type": "text/plain",
        "file_size_bytes": 100,
        "checksum_sha256": "abc123",
        "source_type": "local",
        "source_metadata": {},
    }
    base.update(overrides)
    return base


def _make_message(body: bytes) -> MagicMock:
    """Create a mock aio_pika.IncomingMessage.

    Args:
        body: Raw bytes that will be the message body.

    Returns:
        MagicMock with async ack, nack, reject methods.
    """
    msg = MagicMock()
    msg.body = body
    msg.ack = AsyncMock()
    msg.nack = AsyncMock()
    msg.reject = AsyncMock()
    return msg


def _make_handler(db_pool=None, embedding_service=None, qdrant_service=None) -> EmbedHandler:
    """Construct an EmbedHandler with fully mocked dependencies.

    Args:
        db_pool: asyncpg Pool mock; defaults to a new AsyncMock.
        embedding_service: EmbeddingService mock; defaults to a new AsyncMock.
        qdrant_service: QdrantService mock; defaults to a new AsyncMock.

    Returns:
        EmbedHandler instance wired with mocks.
    """
    pool = db_pool or AsyncMock()
    pool.execute = AsyncMock()

    emb = embedding_service or AsyncMock()
    emb.encode_batch = AsyncMock(return_value=[[0.0] * 1024])

    qdr = qdrant_service or AsyncMock()
    qdr.ensure_collection = AsyncMock()
    qdr.upsert_chunks = AsyncMock()

    return EmbedHandler(
        db_pool=pool,
        embedding_service=emb,
        qdrant_service=qdr,
    )


# ---------------------------------------------------------------------------
# Valid message -> ack
# ---------------------------------------------------------------------------


async def test_handle_valid_message_acks():
    """A well-formed message that processes successfully should be acked."""
    handler = _make_handler()
    payload = _make_valid_payload()
    amqp_msg = _make_message(json.dumps(payload).encode())

    # Patch file existence check and extractor to return controlled text
    with (
        patch("app.handlers.embed_handler.Path") as mock_path_cls,
        patch("app.handlers.embed_handler.get_extractor") as mock_get_extractor,
    ):
        mock_path_inst = MagicMock()
        mock_path_inst.exists.return_value = True
        mock_path_cls.return_value = mock_path_inst

        mock_extractor = AsyncMock()
        mock_extractor.extract = AsyncMock(return_value="some extracted text")
        mock_get_extractor.return_value = mock_extractor

        await handler.handle(amqp_msg)

    amqp_msg.ack.assert_awaited_once()
    amqp_msg.nack.assert_not_awaited()
    amqp_msg.reject.assert_not_awaited()


# ---------------------------------------------------------------------------
# Invalid JSON -> reject
# ---------------------------------------------------------------------------


async def test_handle_invalid_json_rejects():
    """A message with invalid JSON body should be rejected (dead-lettered)."""
    handler = _make_handler()
    amqp_msg = _make_message(b"this is not valid json{{{{")

    await handler.handle(amqp_msg)

    amqp_msg.reject.assert_awaited_once_with(requeue=False)
    amqp_msg.ack.assert_not_awaited()
    amqp_msg.nack.assert_not_awaited()


# ---------------------------------------------------------------------------
# Unknown MIME type -> graceful (empty text) -> ack
# ---------------------------------------------------------------------------


async def test_handle_no_extractor_still_acks():
    """Unknown mime_type should produce empty text but still ack the message."""
    handler = _make_handler()
    payload = _make_valid_payload(mime_type="application/x-unknown-garbage")
    amqp_msg = _make_message(json.dumps(payload).encode())

    # get_extractor returns None for unknown types
    with patch("app.handlers.embed_handler.get_extractor", return_value=None):
        await handler.handle(amqp_msg)

    amqp_msg.ack.assert_awaited_once()
    amqp_msg.reject.assert_not_awaited()
    amqp_msg.nack.assert_not_awaited()


# ---------------------------------------------------------------------------
# Retryable ExtractionError -> nack(requeue=True)
# ---------------------------------------------------------------------------


async def test_handle_extraction_error_nacks_retryable():
    """A retryable ExtractionError should cause nack with requeue=True."""
    handler = _make_handler()
    payload = _make_valid_payload()
    amqp_msg = _make_message(json.dumps(payload).encode())

    retryable_error = ExtractionError("/tmp/test.txt", "disk read error", retryable=True)

    with (
        patch("app.handlers.embed_handler.Path") as mock_path_cls,
        patch("app.handlers.embed_handler.get_extractor") as mock_get_extractor,
    ):
        mock_path_inst = MagicMock()
        mock_path_inst.exists.return_value = True
        mock_path_cls.return_value = mock_path_inst

        mock_extractor = AsyncMock()
        mock_extractor.extract = AsyncMock(side_effect=retryable_error)
        mock_get_extractor.return_value = mock_extractor

        await handler.handle(amqp_msg)

    amqp_msg.nack.assert_awaited_once_with(requeue=True)
    amqp_msg.ack.assert_not_awaited()
    amqp_msg.reject.assert_not_awaited()


# ---------------------------------------------------------------------------
# Non-retryable ExtractionError -> reject (dead-letter)
# ---------------------------------------------------------------------------


async def test_handle_extraction_error_rejects_non_retryable():
    """A non-retryable ExtractionError should cause reject (dead-letter)."""
    handler = _make_handler()
    payload = _make_valid_payload()
    amqp_msg = _make_message(json.dumps(payload).encode())

    # retryable=False is the default for ExtractionError
    terminal_error = ExtractionError("/tmp/corrupt.pdf", "file is corrupt", retryable=False)

    with (
        patch("app.handlers.embed_handler.Path") as mock_path_cls,
        patch("app.handlers.embed_handler.get_extractor") as mock_get_extractor,
    ):
        mock_path_inst = MagicMock()
        mock_path_inst.exists.return_value = True
        mock_path_cls.return_value = mock_path_inst

        mock_extractor = AsyncMock()
        mock_extractor.extract = AsyncMock(side_effect=terminal_error)
        mock_get_extractor.return_value = mock_extractor

        await handler.handle(amqp_msg)

    amqp_msg.reject.assert_awaited_once_with(requeue=False)
    amqp_msg.ack.assert_not_awaited()
    amqp_msg.nack.assert_not_awaited()
