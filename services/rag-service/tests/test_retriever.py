"""Tests for the Retriever service.

Covers:
- Happy path: embed → Qdrant search → return chunks
- RetrievalError when embed service is unavailable
- RetrievalError when Qdrant search fails
- Graph expansion applied when use_graph=True
- Graph expansion failure is graceful (logs warning, returns base results)
- Deduplication when graph expansion returns overlapping chunks
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.services.retriever import Retriever, RetrievedChunk
from app.errors import RetrievalError


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def make_chunk(chunk_id: str, score: float = 0.9) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        file_id=f"file-{chunk_id}",
        filename="test.md",
        content=f"Content of {chunk_id}",
        score=score,
    )


FAKE_EMBEDDING = [0.1] * 1024


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_retrieve_happy_path():
    """Returns chunks from Qdrant when embedding and search succeed."""
    retriever = Retriever()
    expected_chunks = [make_chunk("c1"), make_chunk("c2")]

    with (
        patch.object(retriever, "_embed", new_callable=AsyncMock, return_value=FAKE_EMBEDDING),
        patch.object(retriever, "_search_qdrant", new_callable=AsyncMock, return_value=expected_chunks),
        patch.object(retriever, "_expand_via_graph", new_callable=AsyncMock, return_value=[]),
    ):
        result = await retriever.retrieve("test query", user_id="user-1", top_k=5)

    assert len(result) == 2
    assert result[0].chunk_id == "c1"


@pytest.mark.asyncio
async def test_retrieve_embedding_failure_raises():
    """Raises RetrievalError when the embed service is unavailable."""
    retriever = Retriever()

    with patch.object(retriever, "_embed", new_callable=AsyncMock, side_effect=Exception("Connection refused")):
        with pytest.raises(RetrievalError, match="Embedding service unavailable"):
            await retriever.retrieve("query", user_id="user-1")


@pytest.mark.asyncio
async def test_retrieve_qdrant_failure_raises():
    """Raises RetrievalError when Qdrant search fails."""
    retriever = Retriever()

    with (
        patch.object(retriever, "_embed", new_callable=AsyncMock, return_value=FAKE_EMBEDDING),
        patch.object(retriever, "_search_qdrant", new_callable=AsyncMock, side_effect=Exception("Qdrant timeout")),
    ):
        with pytest.raises(RetrievalError, match="Qdrant search failed"):
            await retriever.retrieve("query", user_id="user-1")


@pytest.mark.asyncio
async def test_retrieve_graph_expansion_applied():
    """Applies graph expansion when use_graph=True and base results are non-empty."""
    retriever = Retriever()
    base = [make_chunk("c1", 0.9)]
    expanded = [make_chunk("c2", 0.7)]

    with (
        patch.object(retriever, "_embed", new_callable=AsyncMock, return_value=FAKE_EMBEDDING),
        patch.object(retriever, "_search_qdrant", new_callable=AsyncMock, return_value=base),
        patch.object(retriever, "_expand_via_graph", new_callable=AsyncMock, return_value=expanded),
    ):
        result = await retriever.retrieve("query", user_id="user-1", use_graph=True)

    chunk_ids = [c.chunk_id for c in result]
    assert "c1" in chunk_ids
    assert "c2" in chunk_ids


@pytest.mark.asyncio
async def test_retrieve_graph_expansion_skipped_when_disabled():
    """Skips graph expansion when use_graph=False."""
    retriever = Retriever()
    base = [make_chunk("c1")]

    with (
        patch.object(retriever, "_embed", new_callable=AsyncMock, return_value=FAKE_EMBEDDING),
        patch.object(retriever, "_search_qdrant", new_callable=AsyncMock, return_value=base),
        patch.object(retriever, "_expand_via_graph", new_callable=AsyncMock) as mock_expand,
    ):
        result = await retriever.retrieve("query", user_id="user-1", use_graph=False)

    mock_expand.assert_not_called()
    assert len(result) == 1


@pytest.mark.asyncio
async def test_retrieve_graph_expansion_failure_is_graceful():
    """Returns base results gracefully when graph expansion raises."""
    retriever = Retriever()
    base = [make_chunk("c1")]

    with (
        patch.object(retriever, "_embed", new_callable=AsyncMock, return_value=FAKE_EMBEDDING),
        patch.object(retriever, "_search_qdrant", new_callable=AsyncMock, return_value=base),
        patch.object(retriever, "_expand_via_graph", new_callable=AsyncMock, side_effect=Exception("Neo4j down")),
    ):
        result = await retriever.retrieve("query", user_id="user-1", use_graph=True)

    # Graph failure should not raise — base results returned
    assert len(result) == 1
    assert result[0].chunk_id == "c1"


@pytest.mark.asyncio
async def test_retrieve_deduplicates_overlapping_graph_results():
    """Deduplicates chunks when graph expansion returns chunks already in base results."""
    retriever = Retriever()
    base = [make_chunk("c1", 0.9), make_chunk("c2", 0.8)]
    # Graph expansion returns c1 again (duplicate)
    expanded = [make_chunk("c1", 0.85), make_chunk("c3", 0.75)]

    with (
        patch.object(retriever, "_embed", new_callable=AsyncMock, return_value=FAKE_EMBEDDING),
        patch.object(retriever, "_search_qdrant", new_callable=AsyncMock, return_value=base),
        patch.object(retriever, "_expand_via_graph", new_callable=AsyncMock, return_value=expanded),
    ):
        result = await retriever.retrieve("query", user_id="user-1", use_graph=True, top_k=10)

    # c1 should appear only once
    chunk_ids = [c.chunk_id for c in result]
    assert chunk_ids.count("c1") == 1
    assert "c3" in chunk_ids


@pytest.mark.asyncio
async def test_retrieve_graph_expansion_skipped_when_base_empty():
    """Skips graph expansion when base Qdrant results are empty."""
    retriever = Retriever()

    with (
        patch.object(retriever, "_embed", new_callable=AsyncMock, return_value=FAKE_EMBEDDING),
        patch.object(retriever, "_search_qdrant", new_callable=AsyncMock, return_value=[]),
        patch.object(retriever, "_expand_via_graph", new_callable=AsyncMock) as mock_expand,
    ):
        result = await retriever.retrieve("query", user_id="user-1", use_graph=True)

    mock_expand.assert_not_called()
    assert result == []
