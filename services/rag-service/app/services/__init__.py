"""RAG service — public exports for all service layer classes.

New integrations:
- LLMFactory: capability-based provider routing (Anthropic primary, Ollama fallback)
- QueryClassifier: rule-based query type classification (~5ms, no LLM)
- TierRouter: tiered retrieval orchestrator (BM25 → hybrid → hybrid+rerank)
- LLMGuard: decides whether to invoke LLM or return retrieval results directly
"""

from app.services.generator import LLMGenerator
from app.services.retriever import Retriever as ContextRetriever
from app.services.run_store import RunStore
from app.services.llm_factory import LLMFactory, LLMCapability, LLMResponse, LLMProviderUnavailableError
from app.services.query_classifier import QueryClassifier, QueryType, MIN_TIER
from app.services.tier_router import TierRouter, RoutingResult, SearchResult
from app.services.llm_guard import LLMGuard

__all__ = [
    # Existing services
    "LLMGenerator",
    "ContextRetriever",
    "RunStore",
    # LLM provider factory (ADR-0026)
    "LLMFactory",
    "LLMCapability",
    "LLMResponse",
    "LLMProviderUnavailableError",
    # Tiered retrieval (ADR-0024)
    "QueryClassifier",
    "QueryType",
    "MIN_TIER",
    "TierRouter",
    "RoutingResult",
    "SearchResult",
    "LLMGuard",
]
