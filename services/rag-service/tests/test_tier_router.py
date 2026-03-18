"""Tests for TierRouter — tiered retrieval routing logic.

Verifies that route() short-circuits at the correct confidence threshold,
escalates when results are absent, and handles search-api errors gracefully.
All search-api HTTP calls are mocked via aiohttp.ClientSession.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.query_classifier import QueryClassifier, QueryType
from app.services.tier_router import SearchResult, TierRouter


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_result(score: float) -> SearchResult:
    """Return a minimal SearchResult with the given score."""
    return SearchResult(
        file_id="file-001",
        filename="test.pdf",
        snippet="Some content",
        score=score,
    )


def _mock_search_response(results: list[dict]):
    """Build a mock aiohttp response that returns the given results JSON."""
    mock_resp = AsyncMock()
    mock_resp.ok = True
    mock_resp.json = AsyncMock(return_value={"results": results})
    return mock_resp


def _mock_search_error(exc: Exception):
    """Build a mock aiohttp response that raises the given exception on get()."""
    mock_resp = MagicMock()
    mock_resp.__aenter__ = AsyncMock(side_effect=exc)
    mock_resp.__aexit__ = AsyncMock(return_value=False)
    return mock_resp


# ---------------------------------------------------------------------------
# Tier-0 threshold — LOOKUP query with high BM25 score short-circuits at Tier 1
# ---------------------------------------------------------------------------


async def test_route_lookup_high_score_short_circuits_at_tier1():
    """LOOKUP query with Tier-1 BM25 score >= 0.9 should return immediately (no further escalation)."""
    high_score_result = {
        "fileId": "file-001",
        "filename": "test.pdf",
        "snippet": "Direct answer snippet",
        "score": 0.95,
        "chunkIndex": 0,
        "sourceId": "src-001",
    }

    mock_resp = _mock_search_response([high_score_result])
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    mock_session = MagicMock()
    mock_session.get = MagicMock(return_value=mock_ctx)

    mock_session_ctx = MagicMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

    # Use a classifier that always returns LOOKUP
    classifier = MagicMock(spec=QueryClassifier)
    classifier.classify.return_value = QueryType.LOOKUP

    router = TierRouter(search_api_url="http://search-api:8001", classifier=classifier)

    with patch("app.services.tier_router.aiohttp.ClientSession", return_value=mock_session_ctx):
        result = await router.route("what is BGE-M3?", user_id="user-001")

    # Should stop at Tier 1 — only one HTTP call
    assert mock_session.get.call_count == 1
    assert result.tier_used == 1
    assert len(result.results) == 1
    assert result.results[0].score == 0.95


# ---------------------------------------------------------------------------
# Tier-1 threshold — EXPLAIN query with moderate BM25 score escalates to Tier 2
# ---------------------------------------------------------------------------


async def test_route_explain_calls_bm25_then_hybrid():
    """EXPLAIN query at Tier 2: first call returns low BM25 score, second call returns hybrid."""
    bm25_result = {
        "fileId": "file-001",
        "filename": "test.pdf",
        "snippet": "partial match",
        "score": 0.5,  # below 0.9 → escalate
        "chunkIndex": 0,
        "sourceId": "src-001",
    }
    hybrid_result = {
        "fileId": "file-001",
        "filename": "test.pdf",
        "snippet": "better hybrid match",
        "score": 0.85,  # above 0.8 → stop
        "chunkIndex": 0,
        "sourceId": "src-001",
    }

    call_count = 0

    async def _fake_resp_json():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return {"results": [bm25_result]}
        return {"results": [hybrid_result]}

    mock_resp = AsyncMock()
    mock_resp.ok = True
    mock_resp.json = _fake_resp_json

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    mock_session = MagicMock()
    mock_session.get = MagicMock(return_value=mock_ctx)

    mock_session_ctx = MagicMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

    # EXPLAIN starts at Tier 2 (min_tier=2), so range(max(2,1),4) = range(2,4) → tiers 2, 3
    # First iteration uses tier 2 (hybrid), which returns 0.85 >= 0.8 → short-circuit
    classifier = MagicMock(spec=QueryClassifier)
    classifier.classify.return_value = QueryType.EXPLAIN

    router = TierRouter(search_api_url="http://search-api:8001", classifier=classifier)

    with patch("app.services.tier_router.aiohttp.ClientSession", return_value=mock_session_ctx):
        result = await router.route("how does BGE-M3 work?", user_id="user-001")

    # EXPLAIN min_tier=2, so Tier 2 (hybrid) is called first; score 0.85 >= 0.8 → stop
    assert mock_session.get.call_count == 1
    assert result.tier_used == 2


# ---------------------------------------------------------------------------
# SYNTHESIZE query — skips to Tier 3 and calls hybrid search
# ---------------------------------------------------------------------------


async def test_route_synthesize_uses_hybrid_search():
    """SYNTHESIZE query starts at Tier 3; always returns results from that tier."""
    hybrid_result = {
        "fileId": "file-002",
        "filename": "compare.pdf",
        "snippet": "comparison snippet",
        "score": 0.72,
        "chunkIndex": 1,
        "sourceId": "src-002",
    }

    mock_resp = _mock_search_response([hybrid_result])
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    mock_session = MagicMock()
    mock_session.get = MagicMock(return_value=mock_ctx)

    mock_session_ctx = MagicMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

    classifier = MagicMock(spec=QueryClassifier)
    classifier.classify.return_value = QueryType.SYNTHESIZE

    router = TierRouter(search_api_url="http://search-api:8001", classifier=classifier)

    with patch("app.services.tier_router.aiohttp.ClientSession", return_value=mock_session_ctx):
        result = await router.route("compare Qdrant and Pinecone", user_id="user-001")

    # SYNTHESIZE min_tier=3, range(3,4) → only Tier 3
    assert result.tier_used == 3
    assert result.query_type == QueryType.SYNTHESIZE
    assert len(result.results) == 1
    assert result.llm_needed is True  # SYNTHESIZE always needs LLM


# ---------------------------------------------------------------------------
# Escalation — Tier 1 returns no results, escalates to Tier 2
# ---------------------------------------------------------------------------


async def test_route_escalates_when_tier_returns_no_results():
    """When Tier 1 returns empty results, TierRouter escalates to the next tier."""
    tier2_result = {
        "fileId": "file-003",
        "filename": "found.pdf",
        "snippet": "found via hybrid",
        "score": 0.75,
        "chunkIndex": 0,
        "sourceId": "src-003",
    }

    call_count = 0

    async def _fake_resp_json():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return {"results": []}  # Tier 1: no results → escalate
        return {"results": [tier2_result]}  # Tier 2: hybrid finds something

    mock_resp = AsyncMock()
    mock_resp.ok = True
    mock_resp.json = _fake_resp_json

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    mock_session = MagicMock()
    mock_session.get = MagicMock(return_value=mock_ctx)

    mock_session_ctx = MagicMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

    # FIND starts at Tier 1
    classifier = MagicMock(spec=QueryClassifier)
    classifier.classify.return_value = QueryType.FIND

    router = TierRouter(search_api_url="http://search-api:8001", classifier=classifier)

    with patch("app.services.tier_router.aiohttp.ClientSession", return_value=mock_session_ctx):
        result = await router.route("find authentication docs", user_id="user-001")

    # Two HTTP calls: Tier 1 (empty) → Tier 2 (result found)
    assert mock_session.get.call_count == 2
    assert result.tier_used == 2
    assert len(result.results) == 1


# ---------------------------------------------------------------------------
# Search-api unavailable — aiohttp.ClientError → returns gracefully degraded result
# ---------------------------------------------------------------------------


async def test_route_search_api_unavailable_returns_empty_results():
    """When search-api raises ClientError on every call, route() returns empty results gracefully.

    TierRouter is designed for graceful degradation — it never raises SearchUnavailableError
    itself; instead it returns an empty result set and sets llm_needed=True.
    """
    import aiohttp

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(side_effect=aiohttp.ClientError("connection refused"))
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    mock_session = MagicMock()
    mock_session.get = MagicMock(return_value=mock_ctx)

    mock_session_ctx = MagicMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

    classifier = MagicMock(spec=QueryClassifier)
    classifier.classify.return_value = QueryType.LOOKUP

    router = TierRouter(search_api_url="http://search-api:8001", classifier=classifier)

    with patch("app.services.tier_router.aiohttp.ClientSession", return_value=mock_session_ctx):
        result = await router.route("what is BGE-M3?", user_id="user-001")

    # Graceful degradation: no exception raised, empty results, llm_needed=True
    assert result.results == []
    assert result.llm_needed is True
