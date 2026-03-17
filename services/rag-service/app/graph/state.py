from typing import TypedDict, Annotated
import operator


class SearchResult(TypedDict):
    chunk_id: str
    content: str
    score: float
    file_id: str
    file_name: str
    chunk_index: int


class Citation(TypedDict):
    file_id: str
    file_name: str
    chunk_index: int
    excerpt: str
    score: float


class GraphState(TypedDict):
    query: str
    rewritten_query: str | None
    user_id: str
    session_id: str | None
    chunks: list[SearchResult]
    graded_chunks: list[SearchResult]
    context: str
    answer: str
    citations: list[Citation]
    iteration: int  # rewrite loop counter, max 2
    error: str | None
