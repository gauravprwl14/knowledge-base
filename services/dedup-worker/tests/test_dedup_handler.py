"""
Unit tests for DedupHandler.

Uses unittest.mock to isolate Redis, asyncpg, and aio_pika dependencies so
tests run without any live infrastructure.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.handlers.dedup_handler import DedupHandler, _REDIS_KEY_PREFIX
from app.models.messages import DedupCheckMessage
from app.utils.errors import DatabaseError, HashLookupError


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_message(overrides: dict | None = None) -> DedupCheckMessage:
    """Build a valid DedupCheckMessage for tests.

    Args:
        overrides: Optional field overrides applied on top of the defaults.

    Returns:
        DedupCheckMessage: Fully populated message instance.
    """
    data = {
        "file_id": "file-001",
        "user_id": "user-001",
        "checksum_sha256": "abc123def456" * 5,  # 60 chars (fake hash)
        "source_id": "src-001",
        "file_size_bytes": 1024,
        "file_name": "document.pdf",
    }
    if overrides:
        data.update(overrides)
    return DedupCheckMessage(**data)


def _amqp_message(msg: DedupCheckMessage) -> MagicMock:
    """Wrap a DedupCheckMessage in a mock aio_pika IncomingMessage.

    Args:
        msg: The message to serialise into the mock body.

    Returns:
        MagicMock: Mock with `.body`, `.ack`, `.nack`, `.reject` async methods.
    """
    mock = MagicMock()
    mock.body = msg.model_dump_json().encode()
    mock.ack = AsyncMock()
    mock.nack = AsyncMock()
    mock.reject = AsyncMock()
    return mock


@pytest.fixture
def handler() -> DedupHandler:
    """Return a DedupHandler with all I/O clients replaced by AsyncMocks.

    Returns:
        DedupHandler: Handler instance with mocked channel, redis, and db_pool.
    """
    channel = MagicMock()
    redis_client = AsyncMock()
    db_pool = MagicMock()
    # Simulate asyncpg pool context manager
    conn_mock = AsyncMock()
    conn_mock.execute = AsyncMock()
    db_pool.acquire = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=conn_mock),
        __aexit__=AsyncMock(return_value=False),
    ))
    return DedupHandler(channel, redis_client, db_pool)


# ---------------------------------------------------------------------------
# Tests: cache miss path (new file)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_cache_miss_acks_message(handler: DedupHandler) -> None:
    """A first-seen file should be recorded in Redis and the DB; message acked.

    Args:
        handler: DedupHandler fixture with mocked backends.
    """
    msg = _make_message()
    amqp_msg = _amqp_message(msg)

    handler._redis.get = AsyncMock(return_value=None)
    handler._redis.set = AsyncMock()

    await handler.handle(amqp_msg)

    amqp_msg.ack.assert_awaited_once()
    amqp_msg.nack.assert_not_awaited()
    amqp_msg.reject.assert_not_awaited()

    cache_key = f"{_REDIS_KEY_PREFIX}{msg.checksum_sha256}"
    handler._redis.set.assert_awaited_once_with(
        cache_key, msg.file_id, ex=pytest.approx(604_800, rel=0.01)
    )


# ---------------------------------------------------------------------------
# Tests: cache hit path (duplicate)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_cache_hit_logs_duplicate_and_acks(handler: DedupHandler) -> None:
    """A previously seen hash should trigger the duplicate stub and ack the message.

    Args:
        handler: DedupHandler fixture with mocked backends.
    """
    existing_id = "file-000"
    msg = _make_message()
    amqp_msg = _amqp_message(msg)

    handler._redis.get = AsyncMock(return_value=existing_id.encode())
    handler._redis.set = AsyncMock()

    await handler.handle(amqp_msg)

    amqp_msg.ack.assert_awaited_once()
    # Should NOT write to Redis when duplicate detected
    handler._redis.set.assert_not_awaited()


# ---------------------------------------------------------------------------
# Tests: malformed message
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_invalid_body_rejects_message(handler: DedupHandler) -> None:
    """A message with an unparseable body should be dead-lettered immediately.

    Args:
        handler: DedupHandler fixture with mocked backends.
    """
    amqp_msg = MagicMock()
    amqp_msg.body = b"not valid json"
    amqp_msg.ack = AsyncMock()
    amqp_msg.nack = AsyncMock()
    amqp_msg.reject = AsyncMock()

    await handler.handle(amqp_msg)

    amqp_msg.reject.assert_awaited_once_with(requeue=False)
    amqp_msg.ack.assert_not_awaited()


# ---------------------------------------------------------------------------
# Tests: Redis failure (retryable)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_redis_error_nacks_with_requeue(handler: DedupHandler) -> None:
    """A transient Redis failure should result in nack(requeue=True).

    Args:
        handler: DedupHandler fixture with mocked backends.
    """
    msg = _make_message()
    amqp_msg = _amqp_message(msg)

    handler._redis.get = AsyncMock(side_effect=ConnectionError("Redis unavailable"))

    await handler.handle(amqp_msg)

    amqp_msg.nack.assert_awaited_once_with(requeue=True)
    amqp_msg.ack.assert_not_awaited()


# ---------------------------------------------------------------------------
# Tests: DB failure (retryable)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_db_error_nacks_with_requeue(handler: DedupHandler) -> None:
    """An asyncpg INSERT failure should result in nack(requeue=True).

    Args:
        handler: DedupHandler fixture with mocked backends.
    """
    msg = _make_message()
    amqp_msg = _amqp_message(msg)

    handler._redis.get = AsyncMock(return_value=None)
    handler._redis.set = AsyncMock()

    conn_mock = AsyncMock()
    conn_mock.execute = AsyncMock(side_effect=Exception("DB connection lost"))
    handler._db_pool.acquire = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=conn_mock),
        __aexit__=AsyncMock(return_value=False),
    ))

    await handler.handle(amqp_msg)

    amqp_msg.nack.assert_awaited_once_with(requeue=True)
    amqp_msg.ack.assert_not_awaited()
