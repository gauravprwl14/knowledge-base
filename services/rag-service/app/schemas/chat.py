"""Pydantic schemas for the chat endpoints in rag-service."""

from typing import Optional

from pydantic import BaseModel, Field


class Message(BaseModel):
    """A single conversation message.

    Attributes:
        role: Speaker role — one of "user", "assistant", "system".
        content: Text content of the message.
    """

    role: str  # "user" | "assistant" | "system"
    content: str


class ChatRequest(BaseModel):
    """Request body for the POST /chat SSE streaming endpoint.

    Attributes:
        query: The user's question (2–2000 characters).
        session_id: Optional conversation session identifier for multi-turn context.
        use_graph: When True, attempt Neo4j graph expansion after initial Qdrant search.
        top_k: Maximum number of chunks to retrieve (1–50).
        stream: Legacy flag — kept for backward-compat with /chat/completions.
        conversation_history: Legacy field — kept for backward-compat.
        max_chunks: Legacy field — kept for backward-compat; superseded by top_k.
    """

    query: str = Field(..., min_length=2, max_length=2000)
    session_id: Optional[str] = None
    use_graph: bool = True
    top_k: int = Field(default=10, ge=1, le=50)

    # Backward-compatible legacy fields
    stream: bool = Field(default=True)
    conversation_history: list[Message] = Field(default_factory=list)
    max_chunks: int = Field(default=10, ge=1, le=20)


class SourceReference(BaseModel):
    """A source reference included in the response.

    Attributes:
        file_id: UUID of the source file.
        filename: Original filename of the source document.
        score: Relevance score in [0, 1].
        chunk_index: Ordinal position of the retrieved chunk within the file.
    """

    file_id: str
    filename: str
    score: float
    chunk_index: int = 0


class Citation(BaseModel):
    """A citation returned in non-streaming chat completions.

    Attributes:
        file_id: UUID of the source file.
        filename: Original filename.
        snippet: Short excerpt from the relevant chunk (up to 300 chars).
        score: Relevance score in [0, 1].
        web_view_link: External URL to view the source file (e.g. Google Drive link).
        start_secs: Start timestamp in seconds for voice transcript chunks.
    """

    file_id: str
    filename: str
    snippet: str
    score: float
    web_view_link: Optional[str] = None
    start_secs: Optional[float] = None


class ChatResponse(BaseModel):
    """Response body for the non-streaming POST /chat/completions endpoint.

    Attributes:
        answer: Complete generated answer.
        citations: List of source citations ranked by relevance.
        model: LLM model identifier used for generation.
        prompt_tokens: Optional prompt token count (when available from provider).
        completion_tokens: Optional completion token count (when available).
    """

    answer: str
    citations: list[Citation]
    model: str
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
