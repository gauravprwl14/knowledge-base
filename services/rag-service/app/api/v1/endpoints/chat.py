"""Chat SSE streaming endpoint for rag-service.

Accepts a ChatRequest and streams the LLM answer as Server-Sent Events:
  - ``{"type": "chunk", "content": "<token>"}`` for each generated token.
  - ``{"type": "sources", "sources": [...]}`` once retrieval is complete.
  - ``{"type": "done", "run_id": "<uuid>"}`` as the final event.

Non-streaming POST /chat/completions is kept for backward-compatibility.
"""

from __future__ import annotations

import json
import uuid

import asyncpg
import structlog
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from app.config import get_settings
from app.errors import GeneratorError, RetrievalError
from app.schemas.chat import ChatRequest, ChatResponse, Citation
from app.services.generator import LLMGenerator
from app.services.retriever import Retriever
from app.services.run_store import RunStore

logger = structlog.get_logger(__name__)
settings = get_settings()
router = APIRouter(prefix="/chat", tags=["chat"])


async def get_db() -> asyncpg.Pool:
    """Dependency — returns the shared DB pool from app state.

    Returns:
        asyncpg.Pool: Shared connection pool initialised at startup.
    """
    from app.main import db_pool  # noqa: PLC0415

    return db_pool


async def get_run_store(db: asyncpg.Pool = Depends(get_db)) -> RunStore:
    """Dependency — returns an initialised RunStore backed by asyncpg.

    Args:
        db: Shared asyncpg pool (injected by FastAPI).

    Returns:
        RunStore: Ready-to-use run store with the kms_rag_runs table ensured.
    """
    store = RunStore(db)
    await store.ensure_table()
    return store


@router.post("")
async def chat_stream(
    request: ChatRequest,
    db: asyncpg.Pool = Depends(get_db),
    store: RunStore = Depends(get_run_store),
) -> StreamingResponse:
    """SSE streaming chat endpoint.

    Creates a run record, retrieves relevant chunks, then streams the LLM
    response as SSE events to the client.

    Args:
        request: Validated ChatRequest with query, session_id, use_graph, top_k.
        db: Shared asyncpg connection pool.
        store: Initialised RunStore.

    Returns:
        StreamingResponse: Server-Sent Events stream with chunk / sources / done events.

    Raises:
        HTTPException 503: When retrieval fails due to an upstream service error.
        HTTPException 422: Automatically raised by FastAPI on schema validation failure.
    """
    run_id = str(uuid.uuid4())
    query = request.query

    log = logger.bind(run_id=run_id, query=query[:100])

    await store.create_run(
        run_id=run_id,
        user_id="anonymous",  # TODO: extract from JWT when auth is wired
        query=query,
    )

    retriever = Retriever()
    try:
        chunks = await retriever.retrieve(
            query=query,
            user_id="anonymous",
            top_k=request.top_k,
            use_graph=request.use_graph,
        )
    except RetrievalError as exc:
        log.error("Retrieval failed", error=str(exc))
        await store.fail_run(run_id, str(exc))
        raise HTTPException(status_code=503, detail={"code": exc.code, "message": str(exc)})

    sources = [
        {
            "file_id": c.file_id,
            "filename": c.filename,
            "score": c.score,
            "chunk_index": c.chunk_index,
        }
        for c in chunks
    ]

    generator = LLMGenerator()

    async def event_stream():
        """Inner async generator yielding SSE-formatted events."""
        try:
            async for token in generator.generate_stream(
                query, chunks, run_id=run_id
            ):
                yield f"data: {json.dumps({'type': 'chunk', 'content': token})}\n\n"

            yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'run_id': run_id})}\n\n"

            # Persist completed answer (best-effort — not awaited for latency)
            answer_parts: list[str] = []
            await store.update_run(run_id, "".join(answer_parts), sources)

        except GeneratorError as exc:
            log.error("Generation failed", error=str(exc))
            yield (
                f"data: {json.dumps({'type': 'error', 'code': exc.code, 'message': str(exc)})}\n\n"
            )
            await store.fail_run(run_id, str(exc))

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/completions")
async def chat_completions(
    request: ChatRequest,
    db: asyncpg.Pool = Depends(get_db),
    store: RunStore = Depends(get_run_store),
):
    """Non-streaming chat completions endpoint (backward-compatible).

    Accumulates the full answer and returns it as a JSON response alongside
    source citations.

    Args:
        request: Validated ChatRequest.
        db: Shared asyncpg connection pool.
        store: Initialised RunStore.

    Returns:
        JSONResponse: ChatResponse with answer, citations, and model name.

    Raises:
        HTTPException 503: When retrieval fails.
    """
    run_id = str(uuid.uuid4())
    query = request.query

    log = logger.bind(run_id=run_id)

    await store.create_run(run_id=run_id, user_id="anonymous", query=query)

    retriever = Retriever()
    try:
        chunks = await retriever.retrieve(
            query=query,
            user_id="anonymous",
            top_k=request.top_k,
            use_graph=request.use_graph,
        )
    except RetrievalError as exc:
        log.error("Retrieval failed", error=str(exc))
        await store.fail_run(run_id, str(exc))
        raise HTTPException(status_code=503, detail={"code": exc.code, "message": str(exc)})

    context = "\n---\n".join(c.content for c in chunks)
    generator = LLMGenerator()
    answer = await generator.generate(query, context)

    citations = [
        Citation(
            file_id=c.file_id,
            filename=c.filename,
            snippet=c.content[:300],
            score=c.score,
        )
        for c in chunks
    ]

    sources = [
        {"file_id": c.file_id, "filename": c.filename, "score": c.score}
        for c in chunks
    ]
    await store.update_run(run_id, answer, sources)

    model_name = (
        settings.ollama_model
        if settings.llm_provider == "ollama"
        else settings.openrouter_model
    )
    return JSONResponse(
        ChatResponse(
            answer=answer,
            citations=citations,
            model=model_name,
        ).model_dump()
    )
