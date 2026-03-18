"""
LangGraph graph state definitions.

Contains:
- ``GraphState`` — original TypedDict (used by current nodes, keep as-is)
- ``GraphStateV2`` — Pydantic BaseModel with rolling message window and
  field validation (ADR-0025/ADR-0026)

TODO: migrate nodes.py to GraphStateV2 in Phase 2.
"""
from __future__ import annotations

from typing import Annotated, Any, Optional, TypedDict
from pydantic import BaseModel, Field
from langchain_core.messages import BaseMessage


# ---------------------------------------------------------------------------
# Original TypedDict state — used by all current graph nodes.
# Do NOT remove until Phase 2 migration is complete.
# ---------------------------------------------------------------------------


class SearchResult(TypedDict):
    """A single search result chunk from the retrieval layer."""

    chunk_id: str
    content: str
    score: float
    file_id: str
    file_name: str
    chunk_index: int


class Citation(TypedDict):
    """A citation reference pointing back to a source document chunk."""

    file_id: str
    file_name: str
    chunk_index: int
    excerpt: str
    score: float


class GraphState(TypedDict):
    """LangGraph state for the RAG pipeline (TypedDict, Phase 1).

    Used by all current graph nodes via dict-style access.
    See GraphStateV2 for the upcoming Pydantic-based replacement.
    """

    query: str
    rewritten_query: str | None
    user_id: str
    session_id: str | None
    chunks: list[SearchResult]
    graded_chunks: list[SearchResult]
    context: str
    answer: str
    citations: list[Citation]
    iteration: int  # rewrite loop counter, max 2
    error: str | None


# ---------------------------------------------------------------------------
# GraphStateV2 — Pydantic BaseModel (Phase 2, not yet wired into graph)
#
# Improvements over GraphState:
# - Rolling message window (last 20) prevents O(N²) token growth
# - Pydantic field validation
# - Stores file paths / compact references rather than full content blobs
# - retrieval_tier and retrieval_took_ms for observability
#
# ADR-0025: PostgreSQL checkpointer for persistence.
# ADR-0026: LLM provider abstraction, Anthropic-primary.
# ---------------------------------------------------------------------------


def keep_last_n_messages(n: int = 20):
    """Return a LangGraph reducer that keeps only the last N messages.

    Prevents O(N²) token growth in long conversations by applying a
    rolling window whenever messages are appended to the state.

    Args:
        n: Maximum number of messages to retain (default 20).

    Returns:
        A reducer function compatible with ``Annotated`` field metadata.
    """

    def reducer(
        existing: list, new: list[BaseMessage] | BaseMessage
    ) -> list:
        if isinstance(new, list):
            combined = existing + new
        else:
            combined = existing + [new]
        return combined[-n:]

    return reducer


class GraphStateV2(BaseModel):
    """LangGraph state for the RAG pipeline (Pydantic BaseModel, Phase 2).

    Uses Pydantic BaseModel for validation.
    Keeps message history to last 20 to prevent state bloat.
    Stores file paths (not content) for large data.

    Attributes:
        messages: Rolling window of last 20 LangChain messages.
        query: Current user question/query string.
        search_results: Compact retrieval references (not full content blobs).
        context: Built context text for the current turn; reset each turn.
        answer: Generated answer for the current turn; reset each turn.
        error: Error message if a node failed, otherwise None.
        session_id: Optional session identifier for multi-turn conversations.
        user_id: Optional user identifier for access scoping.
        retrieval_tier: Tier label from the retrieval pipeline (e.g. ``tier1``).
        retrieval_took_ms: Wall-clock time for the retrieval step in milliseconds.
    """

    # Message history — rolling window of last 20 messages
    messages: Annotated[list[Any], keep_last_n_messages(20)] = Field(
        default_factory=list
    )

    # Current question/query
    query: str = ""

    # Search results (stored as compact references, not full content)
    search_results: list[dict[str, Any]] = Field(default_factory=list)

    # Retrieved context text (built from search_results, reset each turn)
    context: str = ""

    # Generated answer (reset each turn)
    answer: str = ""

    # Error state
    error: Optional[str] = None

    # Session/run metadata
    session_id: Optional[str] = None
    user_id: Optional[str] = None

    # Retrieval metadata
    retrieval_tier: Optional[str] = None  # tier0/tier1/tier2/tier3/tier4
    retrieval_took_ms: Optional[float] = None

    class Config:
        """Pydantic model configuration."""

        arbitrary_types_allowed = True
