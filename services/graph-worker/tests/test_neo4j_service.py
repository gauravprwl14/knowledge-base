"""
Unit tests for Neo4jService.

The Neo4j AsyncDriver and session are fully mocked so no live Neo4j
instance is required. All tests verify Cypher is invoked with the expected
parameters and that Neo4jWriteError is raised on driver failures.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.db.neo4j_service import Neo4jService
from app.utils.errors import Neo4jWriteError


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_session_mock() -> AsyncMock:
    """Return a mock Neo4j async session with an async ``run`` method.

    Returns:
        AsyncMock: Context-manager compatible session mock.
    """
    session = AsyncMock()
    session.run = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    return session


def _make_driver_mock(session: AsyncMock) -> MagicMock:
    """Return a mock AsyncDriver that yields the given session.

    Args:
        session: The session mock to return from ``driver.session()``.

    Returns:
        MagicMock: Driver mock with ``session`` and ``close`` configured.
    """
    driver = MagicMock()
    driver.session = MagicMock(return_value=session)
    driver.close = AsyncMock()
    return driver


@pytest.fixture
def session_mock() -> AsyncMock:
    """Provide a fresh session mock for each test.

    Returns:
        AsyncMock: Reusable session mock.
    """
    return _make_session_mock()


@pytest.fixture
def service(session_mock: AsyncMock) -> Neo4jService:
    """Provide a Neo4jService backed by a mocked driver.

    Args:
        session_mock: Injected session mock fixture.

    Returns:
        Neo4jService: Service instance ready for testing.
    """
    driver = _make_driver_mock(session_mock)
    return Neo4jService(driver)


# ---------------------------------------------------------------------------
# upsert_file_node
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upsert_file_node_runs_merge_query(
    service: Neo4jService, session_mock: AsyncMock
) -> None:
    """upsert_file_node should call session.run exactly once with file fields.

    Args:
        service: Neo4jService fixture.
        session_mock: Session mock to inspect call arguments.
    """
    await service.upsert_file_node(
        file_id="file-001",
        filename="report.md",
        user_id="user-001",
        mime_type="text/markdown",
    )

    session_mock.run.assert_awaited_once()
    call_kwargs = session_mock.run.call_args.kwargs
    assert call_kwargs["file_id"] == "file-001"
    assert call_kwargs["filename"] == "report.md"
    assert call_kwargs["user_id"] == "user-001"
    assert call_kwargs["mime_type"] == "text/markdown"


@pytest.mark.asyncio
async def test_upsert_file_node_raises_neo4j_write_error_on_failure(
    service: Neo4jService, session_mock: AsyncMock
) -> None:
    """upsert_file_node should raise Neo4jWriteError when session.run fails.

    Args:
        service: Neo4jService fixture.
        session_mock: Session mock configured to raise on run.
    """
    session_mock.run = AsyncMock(side_effect=Exception("Connection refused"))

    with pytest.raises(Neo4jWriteError) as exc_info:
        await service.upsert_file_node("f", "f.md", "u", "text/plain")

    assert exc_info.value.retryable is True
    assert "MERGE File" in str(exc_info.value)


# ---------------------------------------------------------------------------
# upsert_entity_node
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upsert_entity_node_returns_entity_text(
    service: Neo4jService, session_mock: AsyncMock
) -> None:
    """upsert_entity_node should return the entity_text passed in.

    Args:
        service: Neo4jService fixture.
        session_mock: Session mock (run is a no-op AsyncMock).
    """
    result = await service.upsert_entity_node(
        entity_text="OpenAI",
        entity_label="ORG",
        user_id="user-001",
    )

    assert result == "OpenAI"


@pytest.mark.asyncio
async def test_upsert_entity_node_runs_merge_query(
    service: Neo4jService, session_mock: AsyncMock
) -> None:
    """upsert_entity_node should invoke session.run with correct parameters.

    Args:
        service: Neo4jService fixture.
        session_mock: Session mock to inspect.
    """
    await service.upsert_entity_node("Alice Smith", "PERSON", "user-001")

    session_mock.run.assert_awaited_once()
    call_kwargs = session_mock.run.call_args.kwargs
    assert call_kwargs["text"] == "Alice Smith"
    assert call_kwargs["label"] == "PERSON"
    assert call_kwargs["user_id"] == "user-001"


@pytest.mark.asyncio
async def test_upsert_entity_node_raises_on_failure(
    service: Neo4jService, session_mock: AsyncMock
) -> None:
    """upsert_entity_node should raise Neo4jWriteError when the driver fails.

    Args:
        service: Neo4jService fixture.
        session_mock: Session mock configured to raise.
    """
    session_mock.run = AsyncMock(side_effect=RuntimeError("Neo4j timeout"))

    with pytest.raises(Neo4jWriteError):
        await service.upsert_entity_node("Alice", "PERSON", "user-001")


# ---------------------------------------------------------------------------
# link_file_to_entity
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_link_file_to_entity_runs_merge_relationship(
    service: Neo4jService, session_mock: AsyncMock
) -> None:
    """link_file_to_entity should run a MATCH/MERGE MENTIONS Cypher query.

    Args:
        service: Neo4jService fixture.
        session_mock: Session mock to inspect.
    """
    await service.link_file_to_entity(
        file_id="file-001",
        entity_text="OpenAI",
        user_id="user-001",
    )

    session_mock.run.assert_awaited_once()
    call_kwargs = session_mock.run.call_args.kwargs
    assert call_kwargs["file_id"] == "file-001"
    assert call_kwargs["entity_text"] == "OpenAI"
    assert call_kwargs["user_id"] == "user-001"


@pytest.mark.asyncio
async def test_link_file_to_entity_raises_on_failure(
    service: Neo4jService, session_mock: AsyncMock
) -> None:
    """link_file_to_entity should raise Neo4jWriteError on driver failure.

    Args:
        service: Neo4jService fixture.
        session_mock: Session mock configured to raise.
    """
    session_mock.run = AsyncMock(side_effect=Exception("Write failed"))

    with pytest.raises(Neo4jWriteError) as exc_info:
        await service.link_file_to_entity("file-001", "OpenAI", "user-001")

    assert "MENTIONS" in str(exc_info.value)


# ---------------------------------------------------------------------------
# link_wiki_references
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_link_wiki_references_creates_topic_and_edge(
    service: Neo4jService, session_mock: AsyncMock
) -> None:
    """link_wiki_references should run a MERGE Topic + MERGE REFERENCES query.

    Args:
        service: Neo4jService fixture.
        session_mock: Session mock to inspect.
    """
    await service.link_wiki_references(
        source_filename="notes.md",
        target_name="Python",
        user_id="user-001",
    )

    session_mock.run.assert_awaited_once()
    call_kwargs = session_mock.run.call_args.kwargs
    assert call_kwargs["target_name"] == "Python"
    assert call_kwargs["source_filename"] == "notes.md"
    assert call_kwargs["user_id"] == "user-001"


@pytest.mark.asyncio
async def test_link_wiki_references_raises_on_failure(
    service: Neo4jService, session_mock: AsyncMock
) -> None:
    """link_wiki_references should raise Neo4jWriteError on driver failure.

    Args:
        service: Neo4jService fixture.
        session_mock: Session mock configured to raise.
    """
    session_mock.run = AsyncMock(side_effect=Exception("Transaction failed"))

    with pytest.raises(Neo4jWriteError) as exc_info:
        await service.link_wiki_references("notes.md", "Python", "user-001")

    assert "REFERENCES" in str(exc_info.value)


# ---------------------------------------------------------------------------
# close
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_close_delegates_to_driver(service: Neo4jService) -> None:
    """close() should call driver.close() exactly once.

    Args:
        service: Neo4jService fixture.
    """
    await service.close()

    service._driver.close.assert_awaited_once()
