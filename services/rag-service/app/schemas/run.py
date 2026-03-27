from datetime import datetime
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field
import uuid


class RunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RunInput(BaseModel):
    query: str = Field(..., max_length=500)
    session_id: str | None = None
    user_id: str
    collection_ids: list[str] = []


class RunConfig(BaseModel):
    max_chunks: int = 10
    search_type: str = "hybrid"


class CreateRunRequest(BaseModel):
    input: RunInput
    config: RunConfig = RunConfig()


class Citation(BaseModel):
    file_id: str
    file_name: str
    chunk_index: int
    excerpt: str
    score: float


class RunResponse(BaseModel):
    run_id: str
    status: RunStatus
    created_at: datetime
    completed_at: datetime | None = None
    output: dict[str, Any] | None = None
    error: str | None = None
