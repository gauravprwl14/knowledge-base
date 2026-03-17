"""
Unit tests for GraphHandler.

Uses unittest.mock to isolate asyncpg, Neo4j, and aio_pika dependencies so
tests run without any live infrastructure.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.handlers.graph_handler import Entity, GraphHandler, _extract_entities_stub
from app.models.messages import GraphBuildMessage
from app.utils.errors import ChunkLoadError, Neo4jWriteError


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_message(overrides: dict | None = None) -> GraphBuildMessage:
    """Build a valid GraphBuildMessage for tests.

    Args:
        overrides: Optional field overrides applied on top of the defaults.

    Returns:
        GraphBuildMessage: Fully populated message instance.
    """
    data = {
        "file_id": "file-001",
        "chunk_ids": ["chunk-001", "chunk-002"],
        "user_id": "user-001",
        "source_id": "src-001",
        "file_name": "report.pdf",
        "mime_type": "application/pdf",
    }
    if overrides:
        data.update(overrides)
    return GraphBuildMessage(**data)


def _amqp_message(msg: GraphBuildMessage) -> MagicMock:
    """Wrap a GraphBuildMessage in a mock aio_pika IncomingMessage.

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
def handler() -> GraphHandler:
    """Return a GraphHandler with all I/O clients replaced by mocks.

    Returns:
        GraphHandler: Handler instance with mocked channel, db_pool, and neo4j_driver.
    """
    channel = MagicMock()

    # asyncpg pool mock
    conn_mock = AsyncMock()
    conn_mock.fetch = AsyncMock(return_value=[
        {"id": "chunk-001", "content": "Alice Smith works at Example Corp in London."},
        {"id": "chunk-002", "content": "Example Corp announced a new PRODUCT launch."},
    ])
    db_pool = MagicMock()
    db_pool.acquire = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=conn_mock),
        __aexit__=AsyncMock(return_value=False),
    ))

    # Neo4j driver + session mock
    session_mock = AsyncMock()
    session_mock.run = AsyncMock()
    session_mock.__aenter__ = AsyncMock(return_value=session_mock)
    session_mock.__aexit__ = AsyncMock(return_value=False)
    neo4j_driver = MagicMock()
    neo4j_driver.session = MagicMock(return_value=session_mock)

    return GraphHandler(channel, db_pool, neo4j_driver)


# ---------------------------------------------------------------------------
# Tests: NER stub
# ---------------------------------------------------------------------------


def test_extract_entities_stub_returns_entities() -> None:
    """The NER stub should return at least one Entity regardless of input text.

    Expected: stub always returns exactly two hard-coded entities.
    """
    entities = _extract_entities_stub("some text")
    assert len(entities) == 2
    assert all(isinstance(e, Entity) for e in entities)
    assert all(e.type in {"PERSON", "ORG", "GPE", "EVENT", "PRODUCT"} for e in entities)


# ---------------------------------------------------------------------------
# Tests: happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_valid_message_acks(handler: GraphHandler) -> None:
    """A valid GraphBuildMessage should result in message ack after writing to Neo4j.

    Args:
        handler: GraphHandler fixture with mocked backends.
    """
    msg = _make_message()
    amqp_msg = _amqp_message(msg)

    await handler.handle(amqp_msg)

    amqp_msg.ack.assert_awaited_once()
    amqp_msg.nack.assert_not_awaited()
    amqp_msg.reject.assert_not_awaited()


@pytest.mark.asyncio
async def test_handle_writes_file_node(handler: GraphHandler) -> None:
    """Graph build should invoke at least one Neo4j session.run call for the File node.

    Args:
        handler: GraphHandler fixture with mocked backends.
    """
    msg = _make_message()
    amqp_msg = _amqp_message(msg)

    await handler.handle(amqp_msg)

    # session.run is called multiple times (File node, Entity nodes, CO_OCCURS_WITH)
    session = handler._neo4j.session().__aenter__.return_value
    assert session.run.await_count >= 1


# ---------------------------------------------------------------------------
# Tests: malformed message
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_invalid_body_rejects_message(handler: GraphHandler) -> None:
    """A message with an unparseable body should be dead-lettered immediately.

    Args:
        handler: GraphHandler fixture with mocked backends.
    """
    amqp_msg = MagicMock()
    amqp_msg.body = b"{{bad json"
    amqp_msg.ack = AsyncMock()
    amqp_msg.nack = AsyncMock()
    amqp_msg.reject = AsyncMock()

    await handler.handle(amqp_msg)

    amqp_msg.reject.assert_awaited_once_with(requeue=False)
    amqp_msg.ack.assert_not_awaited()


# ---------------------------------------------------------------------------
# Tests: chunk load failure (retryable)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_chunk_load_error_nacks_with_requeue(handler: GraphHandler) -> None:
    """A transient asyncpg failure should result in nack(requeue=True).

    Args:
        handler: GraphHandler fixture with mocked backends.
    """
    msg = _make_message()
    amqp_msg = _amqp_message(msg)

    conn_mock = AsyncMock()
    conn_mock.fetch = AsyncMock(side_effect=Exception("DB connection lost"))
    handler._db_pool.acquire = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=conn_mock),
        __aexit__=AsyncMock(return_value=False),
    ))

    await handler.handle(amqp_msg)

    amqp_msg.nack.assert_awaited_once_with(requeue=True)
    amqp_msg.ack.assert_not_awaited()


# ---------------------------------------------------------------------------
# Tests: Neo4j write failure (retryable)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_neo4j_error_nacks_with_requeue(handler: GraphHandler) -> None:
    """A Neo4j write failure should result in nack(requeue=True).

    Args:
        handler: GraphHandler fixture with mocked backends.
    """
    msg = _make_message()
    amqp_msg = _amqp_message(msg)

    session_mock = AsyncMock()
    session_mock.run = AsyncMock(side_effect=Exception("Neo4j write timeout"))
    session_mock.__aenter__ = AsyncMock(return_value=session_mock)
    session_mock.__aexit__ = AsyncMock(return_value=False)
    handler._neo4j.session = MagicMock(return_value=session_mock)

    await handler.handle(amqp_msg)

    amqp_msg.nack.assert_awaited_once_with(requeue=True)
    amqp_msg.ack.assert_not_awaited()


# ---------------------------------------------------------------------------
# Tests: empty chunk list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_empty_chunk_ids_acks(handler: GraphHandler) -> None:
    """A message with zero chunk IDs should complete without DB calls and ack.

    Args:
        handler: GraphHandler fixture with mocked backends.
    """
    msg = _make_message(overrides={"chunk_ids": []})
    amqp_msg = _amqp_message(msg)

    await handler.handle(amqp_msg)

    amqp_msg.ack.assert_awaited_once()
