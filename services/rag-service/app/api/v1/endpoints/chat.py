import json
import logging
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse, JSONResponse
import asyncpg

from app.schemas.chat import ChatRequest, ChatResponse
from app.services.retriever import ContextRetriever
from app.services.generator import LLMGenerator
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/chat", tags=["chat"])


async def get_db() -> asyncpg.Pool:
    """Dependency — returns the shared DB pool from app state."""
    from app.main import db_pool
    return db_pool


@router.post("/completions")
async def chat_completions(
    request: ChatRequest,
    db: asyncpg.Pool = Depends(get_db),
):
    retriever = ContextRetriever(db)
    generator = LLMGenerator()

    context, citations = await retriever.retrieve(request.question, request.max_chunks)

    if request.stream:
        async def event_stream():
            async for token in generator.generate_stream(request.question, context):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield f"data: {json.dumps({'citations': [c.model_dump() for c in citations], 'done': True})}\n\n"

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    answer = await generator.generate(request.question, context)
    return JSONResponse(ChatResponse(
        answer=answer,
        citations=citations,
        model=settings.ollama_model if settings.llm_provider == "ollama" else settings.openrouter_model,
    ).model_dump())
