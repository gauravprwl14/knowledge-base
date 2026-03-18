"""Smoke tests for build_rag_graph() — LangGraph orchestrator.

These tests verify that the RAG graph can be constructed without errors
and that the returned object is a callable LangGraph runnable. No actual
LLM or retrieval calls are made.
"""
from __future__ import annotations

import pytest
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# Smoke tests for graph construction
# ---------------------------------------------------------------------------


def test_build_rag_graph_returns_non_none():
    """build_rag_graph() should return a compiled graph object, not None."""
    # Patch telemetry to avoid OTel init side-effects in test environment
    mock_tracer = MagicMock()
    mock_span = MagicMock()
    mock_span.__enter__ = MagicMock(return_value=MagicMock())
    mock_span.__exit__ = MagicMock(return_value=False)
    mock_tracer.start_as_current_span = MagicMock(return_value=mock_span)

    with patch("app.graph.nodes.tracer", mock_tracer):
        from app.services.orchestrator import build_rag_graph

        graph = build_rag_graph()

    assert graph is not None


def test_build_rag_graph_is_callable():
    """The compiled graph must expose ainvoke or astream (LangGraph compiled runnable interface)."""
    mock_tracer = MagicMock()
    mock_span = MagicMock()
    mock_span.__enter__ = MagicMock(return_value=MagicMock())
    mock_span.__exit__ = MagicMock(return_value=False)
    mock_tracer.start_as_current_span = MagicMock(return_value=mock_span)

    with patch("app.graph.nodes.tracer", mock_tracer):
        from app.services.orchestrator import build_rag_graph

        graph = build_rag_graph()

    # A compiled LangGraph StateGraph exposes ainvoke and/or astream
    assert hasattr(graph, "ainvoke") or hasattr(graph, "astream"), (
        "Compiled graph must be a LangGraph runnable with ainvoke or astream"
    )


def test_build_rag_graph_does_not_raise():
    """build_rag_graph() must not raise any exception during construction."""
    mock_tracer = MagicMock()
    mock_span = MagicMock()
    mock_span.__enter__ = MagicMock(return_value=MagicMock())
    mock_span.__exit__ = MagicMock(return_value=False)
    mock_tracer.start_as_current_span = MagicMock(return_value=mock_span)

    with patch("app.graph.nodes.tracer", mock_tracer):
        from app.services.orchestrator import build_rag_graph

        try:
            build_rag_graph()
        except Exception as exc:
            pytest.fail(f"build_rag_graph() raised unexpectedly: {exc}")
