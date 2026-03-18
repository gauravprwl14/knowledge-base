"""LangGraph node functions for the RAG pipeline.

Each function maps GraphState → GraphState and is registered as a node
in the LangGraph workflow. Nodes should never raise — they catch errors
and write them to state["error"] for the routing logic to handle.

ADR-0024: Tiered retrieval routes queries to the cheapest tier first,
short-circuiting when confidence thresholds are met (~90% of queries
never reach Tier 4 / LLM).
"""
from __future__ import annotations

import structlog
from opentelemetry.trace import SpanKind

from app.config import get_settings
from app.graph.state import Citation, GraphState, SearchResult
from app.services.llm_guard import LLMGuard
from app.services.tier_router import TierRouter
from app.telemetry import tracer

logger = structlog.get_logger(__name__)
settings = get_settings()

MAX_REWRITES = 2
RELEVANCE_THRESHOLD = 0.3


async def retrieve(state: GraphState) -> GraphState:
    """Route query through the tiered retrieval system.

    Uses TierRouter to find the cheapest retrieval tier that can answer
    the query. Short-circuits at BM25 (Tier 1) if score > 0.9,
    at hybrid (Tier 2) if score > 0.8, otherwise uses Tier 3.

    Graceful degradation: if search-api is unreachable, the router returns
    an empty result list and the graph routes to generate() which will use
    the LLM Guard to decide whether to attempt LLM with no context.

    Args:
        state: Current GraphState; must contain "query" and "user_id".

    Returns:
        Updated GraphState with "chunks" populated from the winning tier.
    """
    query = state.get("rewritten_query") or state["query"]
    user_id = state["user_id"]

    log = logger.bind(query=query[:100], user_id=user_id)
    log.info("retrieve: starting tiered routing")

    with tracer.start_as_current_span("kb.tiered_retrieve", kind=SpanKind.CLIENT) as span:
        span.set_attribute("query", query[:100])
        span.set_attribute("user_id", user_id)

        router = TierRouter()
        routing_result = await router.route(
            query=query,
            user_id=user_id,
            limit=20,
        )

        span.set_attribute("tier_used", routing_result.tier_used)
        span.set_attribute("result_count", len(routing_result.results))
        span.set_attribute("query_type", routing_result.query_type.value)
        span.set_attribute("llm_needed", routing_result.llm_needed)

    # Convert TierRouter SearchResult objects into GraphState SearchResult dicts.
    # GraphState uses TypedDicts with "content" as the primary text field;
    # TierRouter uses "snippet" (search-api terminology) — map accordingly.
    chunks: list[SearchResult] = [
        SearchResult(
            chunk_id=f"{r.file_id}:{r.chunk_index}",  # synthetic chunk_id from file+index
            content=r.snippet,
            score=r.score,
            file_id=r.file_id,
            file_name=r.filename,
            chunk_index=r.chunk_index,
        )
        for r in routing_result.results
    ]

    log.info(
        "retrieve: tiered routing complete",
        tier_used=routing_result.tier_used,
        chunk_count=len(chunks),
        took_ms=round(routing_result.took_ms, 1),
    )

    # Store routing metadata on state so downstream nodes (generate) can access it
    # without re-classifying the query.
    return {
        **state,
        "chunks": chunks,
        # Pass llm_needed hint through state so generate() can consult LLMGuard
        "_routing_result": routing_result,  # type: ignore[typeddict-unknown-key]
    }


async def grade_documents(state: GraphState) -> GraphState:
    """Grade chunks for relevance using a score threshold.

    Filters the raw chunks returned by retrieve() down to those with a
    score >= RELEVANCE_THRESHOLD. This acts as a final quality gate before
    the context is sent to the LLM.

    Args:
        state: GraphState containing "chunks" from the retrieve node.

    Returns:
        Updated GraphState with "graded_chunks" containing only relevant chunks.
    """
    log = logger.bind(chunk_count=len(state["chunks"]))
    log.info("grade_documents: applying relevance threshold", threshold=RELEVANCE_THRESHOLD)

    with tracer.start_as_current_span("kb.rag_grade") as span:
        graded = [
            c for c in state["chunks"]
            if c.get("score", 0) >= RELEVANCE_THRESHOLD
        ]
        span.set_attribute("relevant_count", len(graded))

    log.info("grade_documents: complete", relevant=len(graded), dropped=len(state["chunks"]) - len(graded))
    return {**state, "graded_chunks": graded}


async def rewrite_query(state: GraphState) -> GraphState:
    """Rewrite the query for better retrieval.

    Stub implementation returns the original query. Future milestone (M10)
    will call the LLM to expand, rephrase, or decompose the query.

    Args:
        state: GraphState; "iteration" tracks rewrite attempts.

    Returns:
        Updated GraphState with "rewritten_query" and incremented "iteration".
    """
    logger.info(
        "rewrite_query: passthrough (stub — M10 will add LLM rewrite)",
        iteration=state["iteration"],
        query=state["query"][:100],
    )
    # TODO M10: call LLM to rewrite and expand the query
    return {
        **state,
        "rewritten_query": state["query"],
        "iteration": state["iteration"] + 1,
    }


async def generate(state: GraphState) -> GraphState:
    """Generate an answer using LLM Guard + Generator.

    LLM Guard checks whether the retrieval results are high-confidence enough
    to answer without an LLM call (~90% of LOOKUP/FIND queries skip the LLM).
    When the guard permits, uses LLMGenerator (Ollama-primary, OpenRouter fallback).

    If LLM is disabled or unavailable, formats retrieval snippets directly as
    the answer (graceful degradation — always returns something useful).

    Args:
        state: GraphState with "graded_chunks" from the grade_documents node.

    Returns:
        Updated GraphState with "answer", "context", and "citations".
    """
    from app.services.generator import LLMGenerator  # noqa: PLC0415 — avoid circular import

    log = logger.bind(chunk_count=len(state["graded_chunks"]))
    log.info("generate: starting answer generation")

    # Retrieve the routing result from state if available (set by retrieve() node).
    # Falls back to None — LLMGuard uses graded_chunks scores directly in that case.
    routing_result = state.get("_routing_result")  # type: ignore[call-overload]

    # Build context from graded chunks
    context_parts = [c["content"] for c in state["graded_chunks"][:10]]
    context = "\n\n".join(context_parts)

    citations: list[Citation] = [
        Citation(
            file_id=c["file_id"],
            file_name=c["file_name"],
            chunk_index=c["chunk_index"],
            excerpt=c["content"][:200],
            score=c["score"],
        )
        for c in state["graded_chunks"][:5]
    ]

    with tracer.start_as_current_span("kb.rag_generate", kind=SpanKind.CLIENT) as span:
        # Determine whether LLM should be called.
        # If we have a routing result from TierRouter, use LLMGuard for the decision.
        # Otherwise fall back to the settings.llm_enabled flag.
        should_call_llm = False
        if routing_result is not None:
            guard = LLMGuard(llm_available=settings.llm_enabled)
            should_call_llm = guard.should_call_llm(routing_result)
        else:
            # No routing metadata available — use the global LLM flag as a proxy
            should_call_llm = settings.llm_enabled

        span.set_attribute("llm_guard_decision", should_call_llm)
        span.set_attribute("graded_chunk_count", len(state["graded_chunks"]))

        if should_call_llm and state["graded_chunks"]:
            log.info("generate: LLM Guard approved — calling LLMGenerator")
            generator = LLMGenerator()
            # Accumulate all streaming tokens into a single string for the graph state
            tokens: list[str] = []
            try:
                async for token in generator.generate_stream(
                    state["query"], state["graded_chunks"], run_id=state.get("session_id", "graph")
                ):
                    tokens.append(token)
                answer = "".join(tokens)
            except Exception as exc:  # noqa: BLE001
                # LLM failure should never crash the graph — fall back to direct results
                log.warning(
                    "generate: LLM call failed — falling back to direct retrieval answer",
                    error=str(exc),
                )
                answer = _format_direct_answer(context)
        else:
            # LLM Guard decided retrieval results are sufficient (or LLM is disabled)
            reason = "LLM disabled" if not settings.llm_enabled else "LLM Guard: high-confidence retrieval result"
            log.info("generate: skipping LLM — formatting direct answer", reason=reason)
            answer = _format_direct_answer(context)

        span.set_attribute("answer_len", len(answer))

    return {**state, "context": context, "answer": answer, "citations": citations}


def should_rewrite(state: GraphState) -> str:
    """Routing function: 'rewrite' if graded chunks are empty and iter < MAX, else 'generate'.

    Args:
        state: GraphState with "graded_chunks" and "iteration".

    Returns:
        str: "rewrite" to loop back through retrieval, "generate" to proceed.
    """
    if not state["graded_chunks"] and state["iteration"] < MAX_REWRITES:
        return "rewrite"
    return "generate"


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _format_direct_answer(context: str) -> str:
    """Format retrieval context as a direct answer when no LLM is used.

    Args:
        context: Concatenated chunk content string.

    Returns:
        str: Human-readable response based purely on retrieved content.
    """
    if not context:
        return "No relevant documents found in the knowledge base for your question."
    return (
        "Here are the most relevant excerpts from your knowledge base:\n\n"
        f"{context}"
    )
