"""LangGraph node functions for the RAG pipeline."""
import structlog
import httpx
from app.graph.state import GraphState, SearchResult, Citation
from app.config import get_settings
from app.telemetry import tracer
from opentelemetry.trace import SpanKind

logger = structlog.get_logger(__name__)
settings = get_settings()

MAX_REWRITES = 2
RELEVANCE_THRESHOLD = 0.3


async def retrieve(state: GraphState) -> GraphState:
    """Call search-api to retrieve relevant chunks."""
    query = state.get("rewritten_query") or state["query"]
    logger.info("Retrieving chunks", query=query[:100], user_id=state["user_id"])

    with tracer.start_as_current_span("kb.vector_search", kind=SpanKind.CLIENT) as span:
        span.set_attribute("query", query[:100])
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{settings.search_api_url}/search",
                params={"q": query, "type": "hybrid", "limit": 20, "user_id": state["user_id"]},
            )
            resp.raise_for_status()
            data = resp.json()

    chunks: list[SearchResult] = data.get("results", [])
    span.set_attribute("chunk_count", len(chunks))
    return {**state, "chunks": chunks}


async def grade_documents(state: GraphState) -> GraphState:
    """Grade chunks for relevance. Stub: uses score threshold."""
    logger.info("Grading documents", chunk_count=len(state["chunks"]))

    with tracer.start_as_current_span("kb.rag_grade") as span:
        graded = [c for c in state["chunks"] if c.get("score", 0) >= RELEVANCE_THRESHOLD]
        span.set_attribute("relevant_count", len(graded))

    return {**state, "graded_chunks": graded}


async def rewrite_query(state: GraphState) -> GraphState:
    """Rewrite the query for better retrieval. Stub returns original query."""
    logger.info("Rewriting query", iteration=state["iteration"], query=state["query"][:100])
    # TODO M10: call LLM to rewrite
    return {**state, "rewritten_query": state["query"], "iteration": state["iteration"] + 1}


async def generate(state: GraphState) -> GraphState:
    """Generate answer from context chunks. Stub returns placeholder."""
    logger.info("Generating answer", chunk_count=len(state["graded_chunks"]))

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

    # TODO M10: real LLM streaming call via Anthropic SDK or Ollama
    answer = f"[LLM stub] Based on {len(state['graded_chunks'])} relevant chunks: {context[:500]}..."

    return {**state, "context": context, "answer": answer, "citations": citations}


def should_rewrite(state: GraphState) -> str:
    """Routing function: 'rewrite' if graded chunks are empty and iter < MAX, else 'generate'."""
    if not state["graded_chunks"] and state["iteration"] < MAX_REWRITES:
        return "rewrite"
    return "generate"
