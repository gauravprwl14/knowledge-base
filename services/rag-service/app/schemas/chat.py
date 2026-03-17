from pydantic import BaseModel, Field
from typing import Optional

class Message(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str

class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    conversation_history: list[Message] = Field(default_factory=list)
    max_chunks: int = Field(default=10, ge=1, le=20)
    stream: bool = Field(default=True)

class Citation(BaseModel):
    file_id: str
    filename: str
    snippet: str
    score: float

class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    model: str
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
