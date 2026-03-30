"""Tests for the Retriever service.

Covers:
- Happy path: embed → Qdrant search → return chunks
- RetrievalError when embed service is unavailable
- RetrievalError when Qdrant search fails
- Graph expansion applied when use_graph=True
- Graph expansion failure is graceful (logs warning, returns base results)
- Deduplication when graph expansion returns overlapping chunks
- ContextRetriever: citation snippets are populated and truncated to 300 chars
- ContextRetriever: web_view_link and timestamp_secs are populated from payload
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.retriever import ContextRetriever, Retriever, RetrievedChunk
from app.errors import RetrievalError


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def make_chunk(
    chunk_id: str,
    score: float = 0.9,
    content: str | None = None,
    web_view_link: str | None = None,
    start_secs: float | None = None,
) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        file_id=f"file-{chunk_id}",
        filename="test.md",
        content=content if content is not None else f"Content of {chunk_id}",
        score=score,
        web_view_link=web_view_link,
        start_secs=start_secs,
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


# ---------------------------------------------------------------------------
# ContextRetriever: citation population tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_context_retriever_citations_have_non_empty_snippet():
    """Citations returned by ContextRetriever must have a non-empty snippet."""
    db_pool = MagicMock()
    ctx = ContextRetriever(db_pool)
    chunks = [make_chunk("c1", content="The RAG pipeline uses BM25 and semantic search.")]

    with patch.object(ctx._retriever, "retrieve", new_callable=AsyncMock, return_value=chunks):
        _, citations = await ctx.retrieve("RAG", user_id="user-1")

    assert len(citations) == 1
    assert citations[0].snippet != ""
    assert len(citations[0].snippet) > 0


@pytest.mark.asyncio
async def test_context_retriever_snippet_truncated_to_300_chars():
    """Citation snippet must not exceed 300 characters."""
    db_pool = MagicMock()
    ctx = ContextRetriever(db_pool)
    long_content = "x" * 500  # intentionally exceeds 300 chars
    chunks = [make_chunk("c1", content=long_content)]

    with patch.object(ctx._retriever, "retrieve", new_callable=AsyncMock, return_value=chunks):
        _, citations = await ctx.retrieve("anything", user_id="user-1")

    assert len(citations[0].snippet) <= 300


@pytest.mark.asyncio
async def test_context_retriever_web_view_link_populated():
    """Citation web_view_link is populated from the chunk payload."""
    db_pool = MagicMock()
    ctx = ContextRetriever(db_pool)
    chunks = [make_chunk("c1", web_view_link="https://docs.google.com/file/abc")]

    with patch.object(ctx._retriever, "retrieve", new_callable=AsyncMock, return_value=chunks):
        _, citations = await ctx.retrieve("query", user_id="user-1")

    assert citations[0].web_view_link == "https://docs.google.com/file/abc"


@pytest.mark.asyncio
async def test_context_retriever_timestamp_secs_populated():
    """Citation timestamp_secs is populated from voice transcript chunk payload."""
    db_pool = MagicMock()
    ctx = ContextRetriever(db_pool)
    chunks = [make_chunk("c1", start_secs=42.5)]

    with patch.object(ctx._retriever, "retrieve", new_callable=AsyncMock, return_value=chunks):
        _, citations = await ctx.retrieve("meeting notes", user_id="user-1")

    assert citations[0].timestamp_secs == pytest.approx(42.5)


@pytest.mark.asyncio
async def test_context_retriever_no_duplicate_citations_per_file():
    """When multiple chunks share the same file_id, only one citation is returned."""
    db_pool = MagicMock()
    ctx = ContextRetriever(db_pool)
    # Two chunks from the same file
    chunk_a = make_chunk("c1")
    chunk_b = RetrievedChunk(
        chunk_id="c2",
        file_id="file-c1",  # same file_id as chunk_a
        filename="test.md",
        content="Another chunk from the same file.",
        score=0.8,
    )
    chunks = [chunk_a, chunk_b]

    with patch.object(ctx._retriever, "retrieve", new_callable=AsyncMock, return_value=chunks):
        _, citations = await ctx.retrieve("query", user_id="user-1")

    # Only one citation for the shared file
    assert len(citations) == 1


@pytest.mark.asyncio
async def test_context_retriever_web_view_link_none_when_absent():
    """Citation web_view_link is None when the chunk has no link."""
    db_pool = MagicMock()
    ctx = ContextRetriever(db_pool)
    chunks = [make_chunk("c1")]  # no web_view_link

    with patch.object(ctx._retriever, "retrieve", new_callable=AsyncMock, return_value=chunks):
        _, citations = await ctx.retrieve("query", user_id="user-1")

    assert citations[0].web_view_link is None


@pytest.mark.asyncio
async def test_context_retriever_timestamp_secs_none_when_absent():
    """Citation timestamp_secs is None when the chunk has no start_secs."""
    db_pool = MagicMock()
    ctx = ContextRetriever(db_pool)
    chunks = [make_chunk("c1")]  # no start_secs

    with patch.object(ctx._retriever, "retrieve", new_callable=AsyncMock, return_value=chunks):
        _, citations = await ctx.retrieve("query", user_id="user-1")

    assert citations[0].timestamp_secs is None
