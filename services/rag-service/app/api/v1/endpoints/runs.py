"""ACP-style run lifecycle endpoints."""
import asyncio
import json
import structlog
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from app.schemas.run import CreateRunRequest, RunResponse, RunStatus
from app.services.run_store import RedisRunStore as RunStore
from app.services.orchestrator import rag_graph
from app.errors import RunNotFoundError, QueryTooLongError
import redis.asyncio as aioredis

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/runs", tags=["runs"])


async def get_run_store() -> RunStore:
    from app.main import redis_client
    return RunStore(redis_client)


async def _execute_run(run_id: str, request: CreateRunRequest, store: RunStore) -> None:
    """Background task: run the LangGraph pipeline and update run state."""
    await store.update_status(run_id, RunStatus.RUNNING)
    try:
        initial_state = {
            "query": request.input.query,
            "rewritten_query": None,
            "user_id": request.input.user_id,
            "session_id": request.input.session_id,
            "chunks": [],
            "graded_chunks": [],
            "context": "",
            "answer": "",
            "citations": [],
            "iteration": 0,
            "error": None,
        }
        final_state = await rag_graph.ainvoke(initial_state)
        from datetime import datetime, UTC
        await store.update_status(
            run_id,
            RunStatus.COMPLETED,
            output={"answer": final_state["answer"], "citations": final_state["citations"]},
            completed_at=datetime.now(UTC),
        )
        logger.info("Run completed", run_id=run_id)
    except Exception as e:
        logger.error("Run failed", run_id=run_id, error=str(e))
        await store.update_status(run_id, RunStatus.FAILED, error=str(e))


@router.post("", status_code=202)
async def create_run(request: CreateRunRequest, background_tasks: BackgroundTasks) -> RunResponse:
    """Start a new RAG run. Returns run_id immediately; processing is async."""
    if len(request.input.query) > 500:
        raise HTTPException(status_code=400, detail={"code": "KBRAG0004", "message": "Query too long"})

    store = await get_run_store()
    run = await store.create(request)
    background_tasks.add_task(_execute_run, run.run_id, request, store)
    logger.info("Run started", run_id=run.run_id, user_id=request.input.user_id)
    return run


@router.get("/{run_id}")
async def get_run(run_id: str) -> RunResponse:
    """Poll run status and result."""
    store = await get_run_store()
    run = await store.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail={"code": "KBRAG0007", "message": f"Run {run_id} not found"})
    return run


@router.get("/{run_id}/stream")
async def stream_run(run_id: str) -> StreamingResponse:
    """SSE stream for a run. Polls Redis until completed/failed."""
    store = await get_run_store()

    async def event_generator():
        max_wait = 120  # seconds
        elapsed = 0
        poll_interval = 0.5

        while elapsed < max_wait:
            run = await store.get(run_id)
            if not run:
                yield f"data: {json.dumps({'type': 'error', 'code': 'KBRAG0007', 'message': 'Run not found'})}\n\n"
                return

            if run.status == RunStatus.COMPLETED and run.output:
                # Stream answer tokens (word by word for now — M10 will have real streaming)
                answer: str = run.output.get("answer", "")
                for word in answer.split():
                    yield f"data: {json.dumps({'type': 'token', 'content': word + ' '})}\n\n"
                    await asyncio.sleep(0.02)

                for citation in run.output.get("citations", []):
                    yield f"data: {json.dumps({'type': 'citation', **citation})}\n\n"

                yield f"data: {json.dumps({'type': 'done', 'run_id': run_id})}\n\n"
                return

            if run.status == RunStatus.FAILED:
                yield f"data: {json.dumps({'type': 'error', 'message': run.error or 'Run failed'})}\n\n"
                return

            if run.status == RunStatus.CANCELLED:
                yield f"data: {json.dumps({'type': 'cancelled', 'run_id': run_id})}\n\n"
                return

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        yield f"data: {json.dumps({'type': 'error', 'message': 'Run timed out'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/{run_id}", status_code=204)
async def cancel_run(run_id: str) -> None:
    """Cancel a pending or running job."""
    store = await get_run_store()
    run = await store.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail={"code": "KBRAG0007", "message": f"Run {run_id} not found"})
    await store.update_status(run_id, RunStatus.CANCELLED)
