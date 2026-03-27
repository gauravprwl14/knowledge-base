"""
Unit tests for GraphJobHandler (inline-chunks variant).

All I/O dependencies — asyncpg pool, Neo4jService, EntityExtractor, and
aio_pika.IncomingMessage — are replaced with mocks so no live infrastructure
is required.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.db.neo4j_service import Neo4jService
from app.extractors.entity_extractor import EntityExtractor
from app.handlers.graph_handler import GraphJobHandler
from app.models.messages import GraphJobMessage
from app.utils.errors import Neo4jWriteError, StatusUpdateError


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _make_job(**overrides) -> GraphJobMessage:
    """Build a valid GraphJobMessage with sensible defaults.

    Args:
        **overrides: Field overrides applied on top of the defaults.

    Returns:
        GraphJobMessage: Fully populated message instance.
    """
    data = {
        "file_id": "file-001",
        "source_id": "src-001",
        "user_id": "user-001",
        "filename": "notes.md",
        "chunks": ["Alice works at OpenAI. See [[Python]] for examples."],
        "mime_type": "text/markdown",
    }
    data.update(overrides)
    return GraphJobMessage(**data)


def _amqp_msg(job: GraphJobMessage | None = None, body: bytes | None = None) -> MagicMock:
    """Wrap a GraphJobMessage (or raw bytes) in a mock aio_pika IncomingMessage.

    Args:
        job: Message to serialise; mutually exclusive with body.
        body: Raw bytes body; mutually exclusive with job.

    Returns:
        MagicMock: Mock with async ack/nack/reject methods.
    """
    mock = MagicMock()
    mock.body = body if body is not None else job.model_dump_json().encode()
    mock.ack = AsyncMock()
    mock.nack = AsyncMock()
    mock.reject = AsyncMock()
    return mock


def _make_db_pool() -> MagicMock:
    """Return a mock asyncpg pool whose acquire() context manager is a no-op.

    Returns:
        MagicMock: Pool mock with an async execute method on the connection.
    """
    conn = AsyncMock()
    conn.execute = AsyncMock()
    pool = MagicMock()
    pool.acquire = MagicMock(
        return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=conn),
            __aexit__=AsyncMock(return_value=False),
        )
    )
    return pool


def _make_neo4j_service() -> Neo4jService:
    """Return a Neo4jService with all async methods mocked as no-ops.

    Returns:
        Neo4jService: Service mock with upsert/link methods as AsyncMocks.
    """
    svc = MagicMock(spec=Neo4jService)
    svc.upsert_file_node = AsyncMock()
    svc.upsert_entity_node = AsyncMock(return_value="entity-id")
    svc.link_file_to_entity = AsyncMock()
    svc.link_wiki_references = AsyncMock()
    return svc


def _make_extractor(entities=None, links=None) -> EntityExtractor:
    """Return an EntityExtractor mock with controlled return values.

    Args:
        entities: List of entity dicts to return from extract_entities.
        links: List of link target strings to return from extract_wiki_links.

    Returns:
        EntityExtractor: Mock extractor with pre-configured return values.
    """
    ext = MagicMock(spec=EntityExtractor)
    ext.extract_entities = MagicMock(return_value=entities or [])
    ext.extract_wiki_links = MagicMock(return_value=links or [])
    return ext


@pytest.fixture
def handler() -> GraphJobHandler:
    """Provide a GraphJobHandler with all dependencies mocked.

    Returns:
        GraphJobHandler: Handler ready for testing.
    """
    return GraphJobHandler(
        db_pool=_make_db_pool(),
        neo4j_service=_make_neo4j_service(),
        extractor=_make_extractor(),
    )


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_valid_message_acks(handler: GraphJobHandler) -> None:
    """A well-formed GraphJobMessage should be processed and acked.

    Args:
        handler: GraphJobHandler fixture.
    """
    job = _make_job()
    msg = _amqp_msg(job)

    await handler.handle(msg)

    msg.ack.assert_awaited_once()
    msg.nack.assert_not_awaited()
    msg.reject.assert_not_awaited()


@pytest.mark.asyncio
async def test_handle_valid_message_upserts_file_node(handler: GraphJobHandler) -> None:
    """Processing a valid message should upsert the File node exactly once.

    Args:
        handler: GraphJobHandler fixture.
    """
    job = _make_job()
    msg = _amqp_msg(job)

    await handler.handle(msg)

    handler._neo4j_service.upsert_file_node.assert_awaited_once_with(
        file_id=job.file_id,
        filename=job.filename,
        user_id=job.user_id,
        mime_type=job.mime_type,
    )


@pytest.mark.asyncio
async def test_handle_valid_message_updates_file_status(handler: GraphJobHandler) -> None:
    """Processing a valid message should update kms_files status in PostgreSQL.

    Args:
        handler: GraphJobHandler fixture.
    """
    job = _make_job()
    msg = _amqp_msg(job)

    await handler.handle(msg)

    # Verify that conn.execute was called (status update SQL)
    conn = handler._db_pool.acquire().__aenter__.return_value
    conn.execute.assert_awaited_once()
    call_args = conn.execute.call_args.args
    assert "GRAPH_INDEXED" in call_args[0]
    assert call_args[1] == job.file_id


# ---------------------------------------------------------------------------
# Invalid / malformed message
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_invalid_json_rejects(handler: GraphJobHandler) -> None:
    """Unparseable JSON body should be dead-lettered without nack.

    Args:
        handler: GraphJobHandler fixture.
    """
    msg = _amqp_msg(body=b"{{not valid json")

    await handler.handle(msg)

    msg.reject.assert_awaited_once_with(requeue=False)
    msg.ack.assert_not_awaited()
    msg.nack.assert_not_awaited()


@pytest.mark.asyncio
async def test_handle_missing_field_rejects(handler: GraphJobHandler) -> None:
    """A message missing a required field should be dead-lettered.

    Args:
        handler: GraphJobHandler fixture.
    """
    body = json.dumps({"file_id": "f", "user_id": "u"}).encode()  # missing fields
    msg = _amqp_msg(body=body)

    await handler.handle(msg)

    msg.reject.assert_awaited_once_with(requeue=False)


# ---------------------------------------------------------------------------
# Markdown wiki-link extraction
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_markdown_extracts_wiki_links() -> None:
    """Markdown files should have wiki-links extracted and REFERENCES edges created.

    A markdown job with one wiki-link in a chunk should call
    link_wiki_references exactly once.
    """
    neo4j_svc = _make_neo4j_service()
    extractor = _make_extractor(
        entities=[],
        links=["Python"],  # one wiki-link target
    )
    handler = GraphJobHandler(
        db_pool=_make_db_pool(),
        neo4j_service=neo4j_svc,
        extractor=extractor,
    )

    job = _make_job(
        filename="notes.md",
        mime_type="text/markdown",
        chunks=["See [[Python]] for details."],
    )
    msg = _amqp_msg(job)

    await handler.handle(msg)

    neo4j_svc.link_wiki_references.assert_awaited_once_with(
        source_filename="notes.md",
        target_name="Python",
        user_id="user-001",
    )
    msg.ack.assert_awaited_once()


@pytest.mark.asyncio
async def test_handle_non_markdown_skips_wiki_links() -> None:
    """Non-Markdown files should not call extract_wiki_links at all.

    Even if the chunk contains [[link]] syntax, a PDF file should not trigger
    wiki-link extraction.
    """
    extractor = _make_extractor(entities=[], links=["ShouldNotAppear"])
    neo4j_svc = _make_neo4j_service()
    handler = GraphJobHandler(
        db_pool=_make_db_pool(),
        neo4j_service=neo4j_svc,
        extractor=extractor,
    )

    job = _make_job(
        filename="report.pdf",
        mime_type="application/pdf",
        chunks=["[[Should Not Be Extracted]] plain text."],
    )
    msg = _amqp_msg(job)

    await handler.handle(msg)

    neo4j_svc.link_wiki_references.assert_not_awaited()
    msg.ack.assert_awaited_once()


# ---------------------------------------------------------------------------
# Error handling — Neo4j failure (retryable)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_neo4j_error_nacks_retryable() -> None:
    """A Neo4jWriteError (retryable=True) should result in nack(requeue=True).

    Args: None (inline setup).
    """
    neo4j_svc = _make_neo4j_service()
    neo4j_svc.upsert_file_node = AsyncMock(
        side_effect=Neo4jWriteError(operation="MERGE File", reason="Timeout", retryable=True)
    )
    handler = GraphJobHandler(
        db_pool=_make_db_pool(),
        neo4j_service=neo4j_svc,
        extractor=_make_extractor(),
    )

    job = _make_job()
    msg = _amqp_msg(job)

    await handler.handle(msg)

    msg.nack.assert_awaited_once_with(requeue=True)
    msg.ack.assert_not_awaited()
    msg.reject.assert_not_awaited()


@pytest.mark.asyncio
async def test_handle_neo4j_error_non_retryable_rejects() -> None:
    """A Neo4jWriteError (retryable=False) should result in reject(requeue=False).

    Args: None (inline setup).
    """
    neo4j_svc = _make_neo4j_service()
    neo4j_svc.upsert_file_node = AsyncMock(
        side_effect=Neo4jWriteError(operation="MERGE File", reason="Auth error", retryable=False)
    )
    handler = GraphJobHandler(
        db_pool=_make_db_pool(),
        neo4j_service=neo4j_svc,
        extractor=_make_extractor(),
    )

    job = _make_job()
    msg = _amqp_msg(job)

    await handler.handle(msg)

    msg.reject.assert_awaited_once_with(requeue=False)
    msg.ack.assert_not_awaited()


# ---------------------------------------------------------------------------
# Error handling — status update failure (retryable)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_status_update_failure_nacks() -> None:
    """A PostgreSQL status update failure should result in nack(requeue=True).

    StatusUpdateError is retryable by default, so the message should be
    re-queued for another attempt.
    """
    conn = AsyncMock()
    conn.execute = AsyncMock(side_effect=Exception("DB connection lost"))
    db_pool = MagicMock()
    db_pool.acquire = MagicMock(
        return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=conn),
            __aexit__=AsyncMock(return_value=False),
        )
    )

    handler = GraphJobHandler(
        db_pool=db_pool,
        neo4j_service=_make_neo4j_service(),
        extractor=_make_extractor(),
    )

    job = _make_job()
    msg = _amqp_msg(job)

    await handler.handle(msg)

    msg.nack.assert_awaited_once_with(requeue=True)
    msg.ack.assert_not_awaited()


# ---------------------------------------------------------------------------
# Entity extraction and graph writes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_entities_create_mentions_edges() -> None:
    """Each extracted entity should produce upsert_entity_node + link_file_to_entity calls.

    Two entities in one chunk → two upsert + two link calls.
    """
    neo4j_svc = _make_neo4j_service()
    extractor = _make_extractor(
        entities=[
            {"text": "Alice", "label": "PERSON"},
            {"text": "Acme Corp", "label": "ORG"},
        ]
    )
    handler = GraphJobHandler(
        db_pool=_make_db_pool(),
        neo4j_service=neo4j_svc,
        extractor=extractor,
    )

    job = _make_job(
        chunks=["Alice works at Acme Corp."],
        mime_type="application/pdf",
        filename="report.pdf",
    )
    msg = _amqp_msg(job)

    await handler.handle(msg)

    assert neo4j_svc.upsert_entity_node.await_count == 2
    assert neo4j_svc.link_file_to_entity.await_count == 2
    msg.ack.assert_awaited_once()


@pytest.mark.asyncio
async def test_handle_empty_chunks_acks_without_entity_calls() -> None:
    """A message with an empty chunks list should ack with no entity calls.

    Args: None (inline setup).
    """
    neo4j_svc = _make_neo4j_service()
    handler = GraphJobHandler(
        db_pool=_make_db_pool(),
        neo4j_service=neo4j_svc,
        extractor=_make_extractor(),
    )

    job = _make_job(chunks=[])
    msg = _amqp_msg(job)

    await handler.handle(msg)

    neo4j_svc.upsert_entity_node.assert_not_awaited()
    neo4j_svc.link_file_to_entity.assert_not_awaited()
    msg.ack.assert_awaited_once()
