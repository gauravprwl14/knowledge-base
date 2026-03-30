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


# ---------------------------------------------------------------------------
# kms_chunks dual-write: user_id and source_id must be written
# ---------------------------------------------------------------------------


async def test_chunk_written_to_postgres_after_qdrant_upsert():
    """After a successful embed + Qdrant upsert, chunks must be written to PostgreSQL kms_chunks
    including user_id and source_id so BM25 search can scope results correctly."""
    db_pool = AsyncMock()
    # Track all execute calls
    execute_calls: list[tuple] = []

    async def capture_execute(sql: str, *args):
        execute_calls.append((sql, args))

    db_pool.execute = capture_execute

    emb = AsyncMock()
    emb.encode_batch = AsyncMock(return_value=[[0.0] * 1024])

    qdr = AsyncMock()
    qdr.ensure_collection = AsyncMock()
    qdr.upsert_chunks = AsyncMock()

    handler = EmbedHandler(db_pool=db_pool, embedding_service=emb, qdrant_service=qdr)

    user_id = str(uuid.uuid4())
    source_id = str(uuid.uuid4())
    payload = _make_valid_payload(user_id=user_id, source_id=source_id)
    amqp_msg = _make_message(json.dumps(payload).encode())

    with (
        patch("app.handlers.embed_handler.Path") as mock_path_cls,
        patch("app.handlers.embed_handler.get_extractor") as mock_get_extractor,
    ):
        mock_path_inst = MagicMock()
        mock_path_inst.exists.return_value = True
        mock_path_cls.return_value = mock_path_inst

        mock_extractor = AsyncMock()
        mock_extractor.extract = AsyncMock(return_value="chunk content for testing")
        mock_get_extractor.return_value = mock_extractor

        await handler.handle(amqp_msg)

    amqp_msg.ack.assert_awaited_once()

    # Find the kms_chunks INSERT call(s)
    chunk_inserts = [
        (sql, args) for sql, args in execute_calls if "kms_chunks" in sql
    ]
    assert len(chunk_inserts) >= 1, "Expected at least one INSERT INTO kms_chunks"

    # Verify user_id and source_id are among the arguments passed
    first_sql, first_args = chunk_inserts[0]
    all_args_str = [str(a) for a in first_args]
    assert user_id in all_args_str, f"user_id {user_id} not found in chunk INSERT args"
    assert source_id in all_args_str, f"source_id {source_id} not found in chunk INSERT args"


async def test_chunk_insert_uses_upsert_on_conflict():
    """kms_chunks INSERT must use ON CONFLICT (id) DO UPDATE to be idempotent."""
    db_pool = AsyncMock()
    chunk_insert_sqls: list[str] = []

    async def capture_execute(sql: str, *args):
        if "kms_chunks" in sql:
            chunk_insert_sqls.append(sql)

    db_pool.execute = capture_execute

    emb = AsyncMock()
    emb.encode_batch = AsyncMock(return_value=[[0.0] * 1024])
    qdr = AsyncMock()
    qdr.ensure_collection = AsyncMock()
    qdr.upsert_chunks = AsyncMock()

    handler = EmbedHandler(db_pool=db_pool, embedding_service=emb, qdrant_service=qdr)
    payload = _make_valid_payload()
    amqp_msg = _make_message(json.dumps(payload).encode())

    with (
        patch("app.handlers.embed_handler.Path") as mock_path_cls,
        patch("app.handlers.embed_handler.get_extractor") as mock_get_extractor,
    ):
        mock_path_inst = MagicMock()
        mock_path_inst.exists.return_value = True
        mock_path_cls.return_value = mock_path_inst

        mock_extractor = AsyncMock()
        mock_extractor.extract = AsyncMock(return_value="some content")
        mock_get_extractor.return_value = mock_extractor

        await handler.handle(amqp_msg)

    assert len(chunk_insert_sqls) >= 1
    assert "ON CONFLICT" in chunk_insert_sqls[0].upper(), (
        "kms_chunks INSERT must include ON CONFLICT for idempotency"
    )
