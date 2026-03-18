"""Chat completions endpoint — tiered retrieval + LLM streaming.

Integration points:
- QueryClassifier: classifies query type in ~5ms without LLM
- TierRouter: routes through BM25 → hybrid tiers, short-circuits at confidence thresholds
- LLMGuard: decides whether to call the LLM or return retrieval results directly
- LLMFactory: routes to Anthropic (primary) or Ollama (fallback)
"""
import json
import structlog
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse, JSONResponse
import asyncpg

from app.schemas.chat import ChatRequest, ChatResponse
from app.services.retriever import ContextRetriever
from app.services.generator import LLMGenerator
from app.services.query_classifier import QueryClassifier
from app.services.tier_router import TierRouter
from app.services.llm_guard import LLMGuard
from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()
router = APIRouter(prefix="/chat", tags=["chat"])

# Module-level service instances — created once and reused across requests.
# QueryClassifier is stateless (regex only); TierRouter and LLMGuard are
# also cheap to construct but reused for connection-pool efficiency.
_classifier = QueryClassifier()
_router = TierRouter()
# LLMGuard is initialised with Anthropic availability at startup time.
# If ANTHROPIC_API_KEY is absent, the guard will prefer returning retrieval
# results directly rather than calling Ollama for LOOKUP/FIND/EXPLAIN.
_guard = LLMGuard(llm_available=bool(settings.anthropic_api_key))


async def get_db() -> asyncpg.Pool:
    """Dependency — returns the shared DB pool from app state."""
    from app.main import db_pool
    return db_pool


def _format_sources_event(results) -> str:
    """Serialise retrieval results as a SSE 'sources' event.

    Args:
        results: List of SearchResult objects from TierRouter.

    Returns:
        SSE-formatted string ready to yield from an async generator.
    """
    sources = [r.to_dict() for r in results]
    return f"data: {json.dumps({'sources': sources, 'event': 'sources'})}\n\n"


def _format_done_event(tier_used: int, took_ms: float) -> str:
    """Serialise a SSE 'done' event with retrieval metadata.

    Args:
        tier_used: The retrieval tier that produced the final results.
        took_ms: Wall-clock retrieval latency in milliseconds.

    Returns:
        SSE-formatted string ready to yield from an async generator.
    """
    return f"data: {json.dumps({'done': True, 'tier_used': tier_used, 'took_ms': round(took_ms, 1)})}\n\n"


@router.post("/completions")
async def chat_completions(
    request: ChatRequest,
    db: asyncpg.Pool = Depends(get_db),
):
    """Handle a chat completion request with tiered retrieval.

    Flow:
    1. Classify the query type (LOOKUP/FIND/EXPLAIN/SYNTHESIZE/GENERATE).
    2. Route through retrieval tiers — short-circuit when confidence is high.
    3. LLMGuard decides whether to invoke the LLM or return results directly.
    4a. If no LLM: stream sources + done event (fast path, no token cost).
    4b. If LLM: stream context chunks through generator, then sources + done.

    Args:
        request: ChatRequest with question, stream flag, and optional settings.
        db: Shared asyncpg connection pool (injected by FastAPI DI).

    Returns:
        StreamingResponse (SSE) when request.stream is True,
        JSONResponse (ChatResponse) otherwise.
    """
    user_id = getattr(request, "user_id", "anonymous")
    top_k = getattr(request, "max_chunks", settings.max_context_chunks)

    log = logger.bind(question=request.question[:80], user_id=user_id)
    log.info("chat_completions received")

    # --- Step 1: Classify query type (rule-based, ~5ms, no network) ---
    query_type = _classifier.classify(request.question)
    log.info("Query classified", query_type=query_type.value)

    # --- Step 2: Tiered retrieval ---
    routing_result = await _router.route(
        query=request.question,
        user_id=user_id,
        limit=top_k,
    )
    log.info(
        "Tiered retrieval complete",
        tier_used=routing_result.tier_used,
        result_count=len(routing_result.results),
        llm_needed=routing_result.llm_needed,
        took_ms=round(routing_result.took_ms, 1),
    )

    # --- Step 3: LLM Guard decision ---
    should_llm = _guard.should_call_llm(routing_result)

    if request.stream:
        async def event_stream():
            if not should_llm:
                # Fast path: return retrieval results directly without LLM.
                # This covers ~90% of LOOKUP/FIND/EXPLAIN queries with high-confidence scores.
                log.info("Skipping LLM — returning retrieval results directly")
                yield _format_sources_event(routing_result.results)
                yield _format_done_event(routing_result.tier_used, routing_result.took_ms)
                return

            # LLM path: build context from retrieved chunks and stream tokens.
            # ContextRetriever is used as a convenience wrapper around the DB
            # for any additional context enrichment (e.g. file metadata).
            retriever = ContextRetriever(db)
            context, citations = await retriever.retrieve(request.question, top_k)

            generator = LLMGenerator()
            async for token in generator.generate_stream(request.question, context):
                # Emit each token as an SSE text event
                yield f"data: {json.dumps({'token': token})}\n\n"

            # Emit sources from tiered retrieval (richer than citations alone)
            yield _format_sources_event(routing_result.results)
            yield _format_done_event(routing_result.tier_used, routing_result.took_ms)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # Non-streaming path
    if not should_llm:
        # Return retrieval results directly as a non-streaming response
        log.info("Skipping LLM (non-stream) — returning retrieval results")
        return JSONResponse({
            "answer": "",
            "sources": [r.to_dict() for r in routing_result.results],
            "tier_used": routing_result.tier_used,
            "took_ms": round(routing_result.took_ms, 1),
            "llm_skipped": True,
        })

    retriever = ContextRetriever(db)
    context, citations = await retriever.retrieve(request.question, top_k)

    generator = LLMGenerator()
    answer = await generator.generate(request.question, context)

    # Determine model name for the response envelope
    if settings.anthropic_api_key:
        model_name = settings.anthropic_model
    elif settings.llm_provider == "ollama":
        model_name = settings.ollama_model
    else:
        model_name = settings.openrouter_model

    return JSONResponse(ChatResponse(
        answer=answer,
        citations=citations,
        model=model_name,
    ).model_dump())
