"""GET /agents — agent capabilities discovery."""
from fastapi import APIRouter
from app.config import get_settings

router = APIRouter(prefix="/agents", tags=["agents"])
settings = get_settings()


@router.get("")
async def list_agents() -> dict:
    """Return available agent capabilities."""
    return {
        "agents": [
            {
                "id": "rag-agent",
                "name": "RAG Agent",
                "description": "Retrieval-augmented generation over the KMS knowledge base",
                "version": "1.0.0",
                "capabilities": ["hybrid_search", "graph_expansion", "llm_generation", "sse_streaming"],
                "input_schema": {
                    "query": "string (max 500 chars)",
                    "session_id": "string | null",
                    "user_id": "string (required)",
                    "collection_ids": "string[]",
                },
            }
        ]
    }
