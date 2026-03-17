import uuid
from datetime import datetime, UTC
import redis.asyncio as aioredis
import structlog
from app.schemas.run import RunResponse, RunStatus, CreateRunRequest

logger = structlog.get_logger(__name__)


class RunStore:
    """Redis-backed run state store. TTL: 10 minutes per run."""

    TTL_SECONDS = 600
    KEY_PREFIX = "kms:rag:run:"

    def __init__(self, redis_client: aioredis.Redis) -> None:
        self._redis = redis_client

    def _key(self, run_id: str) -> str:
        return f"{self.KEY_PREFIX}{run_id}"

    async def create(self, request: CreateRunRequest) -> RunResponse:
        """Create a new run record in Redis and return it."""
        run_id = str(uuid.uuid4())
        run = RunResponse(
            run_id=run_id,
            status=RunStatus.PENDING,
            created_at=datetime.now(UTC),
        )
        await self._redis.setex(self._key(run_id), self.TTL_SECONDS, run.model_dump_json())
        logger.info("Run created", run_id=run_id, user_id=request.input.user_id)
        return run

    async def get(self, run_id: str) -> RunResponse | None:
        data = await self._redis.get(self._key(run_id))
        if not data:
            return None
        return RunResponse.model_validate_json(data)

    async def update_status(self, run_id: str, status: RunStatus, **kwargs) -> None:
        run = await self.get(run_id)
        if not run:
            return
        run.status = status
        for k, v in kwargs.items():
            setattr(run, k, v)
        await self._redis.setex(self._key(run_id), self.TTL_SECONDS, run.model_dump_json())

    async def delete(self, run_id: str) -> bool:
        return bool(await self._redis.delete(self._key(run_id)))
