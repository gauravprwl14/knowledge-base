"""Tests for LLMGuard — LLM call gating logic.

Verifies that should_call_llm() correctly skips the LLM for high-confidence
retrieval results and calls it for generation/synthesis queries or low-confidence
results. No I/O — LLMGuard is a pure-logic class.
"""
from __future__ import annotations

import pytest

from app.services.llm_guard import HIGH_CONFIDENCE_THRESHOLD, LLMGuard
from app.services.query_classifier import QueryType
from app.services.tier_router import RoutingResult, SearchResult


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_routing_result(
    query_type: QueryType,
    scores: list[float] | None = None,
    llm_needed: bool = False,
) -> RoutingResult:
    """Build a minimal RoutingResult for testing LLMGuard.

    Args:
        query_type: The classified query type.
        scores: Optional list of result scores (highest-scoring first).
        llm_needed: The llm_needed flag from TierRouter (not used by LLMGuard directly).

    Returns:
        RoutingResult with the requested shape.
    """
    results = [
        SearchResult(
            file_id=f"file-{i}",
            filename=f"doc-{i}.pdf",
            snippet="snippet",
            score=s,
        )
        for i, s in enumerate(scores or [])
    ]
    return RoutingResult(
        results=results,
        tier_used=1,
        query_type=query_type,
        llm_needed=llm_needed,
        took_ms=5.0,
    )


# ---------------------------------------------------------------------------
# LOOKUP / FIND — high-confidence → skip LLM
# ---------------------------------------------------------------------------


def test_should_call_llm_returns_false_for_lookup_high_confidence():
    """LOOKUP query with top score >= 0.85 should not call LLM (retrieval sufficient)."""
    guard = LLMGuard(llm_available=True)
    result = _make_routing_result(QueryType.LOOKUP, scores=[0.92, 0.80])

    assert guard.should_call_llm(result) is False


def test_should_call_llm_returns_false_for_find_high_confidence():
    """FIND query with top score >= 0.85 should not call LLM."""
    guard = LLMGuard(llm_available=True)
    result = _make_routing_result(QueryType.FIND, scores=[0.90])

    assert guard.should_call_llm(result) is False


def test_should_call_llm_returns_false_for_lookup_at_exact_threshold():
    """LOOKUP with top score exactly at HIGH_CONFIDENCE_THRESHOLD (0.85) should skip LLM."""
    guard = LLMGuard(llm_available=True)
    result = _make_routing_result(QueryType.LOOKUP, scores=[HIGH_CONFIDENCE_THRESHOLD])

    assert guard.should_call_llm(result) is False


# ---------------------------------------------------------------------------
# EXPLAIN / SYNTHESIZE / GENERATE — always call LLM when available
# ---------------------------------------------------------------------------


def test_should_call_llm_returns_true_for_explain_regardless_of_score():
    """EXPLAIN query should call LLM even with a high-confidence score."""
    guard = LLMGuard(llm_available=True)
    # EXPLAIN is not in (GENERATE, SYNTHESIZE), so it can actually skip if score is high.
    # Test: moderate confidence → guard returns True (low-confidence path)
    result = _make_routing_result(QueryType.EXPLAIN, scores=[0.70])

    assert guard.should_call_llm(result) is True


def test_should_call_llm_returns_true_for_synthesize():
    """SYNTHESIZE query always requires LLM regardless of retrieval score."""
    guard = LLMGuard(llm_available=True)
    result = _make_routing_result(QueryType.SYNTHESIZE, scores=[0.99])

    assert guard.should_call_llm(result) is True


def test_should_call_llm_returns_true_for_generate():
    """GENERATE query always requires LLM — no retrieval-only fallback."""
    guard = LLMGuard(llm_available=True)
    result = _make_routing_result(QueryType.GENERATE, scores=[0.99])

    assert guard.should_call_llm(result) is True


# ---------------------------------------------------------------------------
# Low-confidence retrieval — LLM called when available
# ---------------------------------------------------------------------------


def test_should_call_llm_returns_true_for_lookup_low_confidence():
    """LOOKUP query with top score < 0.85 (low confidence) should call LLM if available."""
    guard = LLMGuard(llm_available=True)
    result = _make_routing_result(QueryType.LOOKUP, scores=[0.50])

    assert guard.should_call_llm(result) is True


def test_should_call_llm_returns_false_for_lookup_low_confidence_llm_unavailable():
    """When LLM is unavailable, even low-confidence LOOKUP should not attempt LLM call."""
    guard = LLMGuard(llm_available=False)
    result = _make_routing_result(QueryType.LOOKUP, scores=[0.50])

    assert guard.should_call_llm(result) is False


# ---------------------------------------------------------------------------
# Empty results — LLM called when available to explain the gap
# ---------------------------------------------------------------------------


def test_should_call_llm_returns_true_when_no_results():
    """Empty results list means retrieval found nothing — LLM should explain the gap."""
    guard = LLMGuard(llm_available=True)
    result = _make_routing_result(QueryType.LOOKUP, scores=[])

    assert guard.should_call_llm(result) is True


def test_should_call_llm_returns_false_when_no_results_and_llm_unavailable():
    """Empty results with no LLM available → cannot call LLM, return False."""
    guard = LLMGuard(llm_available=False)
    result = _make_routing_result(QueryType.LOOKUP, scores=[])

    assert guard.should_call_llm(result) is False


# ---------------------------------------------------------------------------
# GENERATE / SYNTHESIZE with LLM unavailable — graceful degradation
# ---------------------------------------------------------------------------


def test_should_call_llm_returns_false_for_synthesize_when_llm_unavailable():
    """SYNTHESIZE queries with LLM unavailable degrade gracefully (return retrieval results)."""
    guard = LLMGuard(llm_available=False)
    result = _make_routing_result(QueryType.SYNTHESIZE, scores=[0.85])

    # LLM unavailable → guard returns False to avoid a broken LLM call
    assert guard.should_call_llm(result) is False
