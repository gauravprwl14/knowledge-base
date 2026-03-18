"""Configuration for rag-service.

All values are read from environment variables (or a .env file).
Use get_settings() everywhere — the result is cached via lru_cache.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Runtime configuration for the rag-service.

    Attributes:
        service_name: OTel service.name and log identifier.
        log_level: Python log level string (DEBUG, INFO, WARNING, ERROR).
        database_url: asyncpg-compatible PostgreSQL DSN.
        redis_url: Redis connection URL for run state storage.
        search_api_url: Base URL for the search-api hybrid search service.
        embed_worker_url: HTTP URL to the embed-worker /embed endpoint.
        qdrant_url: Qdrant HTTP base URL.
        qdrant_collection: Qdrant collection name for KMS chunks.
        neo4j_uri: Bolt URI for the Neo4j graph database.
        neo4j_user: Neo4j username.
        neo4j_password: Neo4j password.
        llm_enabled: When False, LLM generation is skipped entirely.
        llm_provider: Active provider — "ollama" or "openrouter".
        ollama_base_url: Ollama HTTP base URL.
        ollama_model: Ollama model name (e.g. llama3.2).
        openrouter_api_key: API key for OpenRouter fallback.
        openrouter_model: Model identifier for OpenRouter.
        max_context_chunks: Maximum chunks to include in LLM context.
        max_tokens: Maximum tokens in LLM completion.
        temperature: LLM sampling temperature.
        otel_endpoint: OTLP gRPC collector endpoint.
        otel_enabled: When False, OTel instrumentation is skipped.
    """

    # Service identity
    service_name: str = "rag-service"
    log_level: str = "INFO"

    # Storage
    database_url: str = Field(..., env="DATABASE_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", env="REDIS_URL")

    # Upstream services
    search_api_url: str = Field(
        default="http://search-api:8001/api/v1", env="SEARCH_API_URL"
    )
    embed_worker_url: str = Field(
        default="http://embed-worker:8004", env="EMBED_WORKER_URL"
    )

    # Qdrant
    qdrant_url: str = Field(default="http://qdrant:6333", env="QDRANT_URL")
    qdrant_collection: str = Field(default="kms_chunks", env="QDRANT_COLLECTION")

    # Neo4j (graph expansion)
    neo4j_uri: str = Field(default="bolt://neo4j:7687", env="NEO4J_URI")
    neo4j_user: str = Field(default="neo4j", env="NEO4J_USER")
    neo4j_password: str = Field(default="neo4j", env="NEO4J_PASSWORD")

    # LLM
    llm_enabled: bool = Field(default=False, env="LLM_ENABLED")
    llm_provider: str = Field(default="ollama", env="LLM_PROVIDER")
    ollama_base_url: str = Field(
        default="http://ollama:11434", env="OLLAMA_BASE_URL"
    )
    ollama_model: str = Field(default="llama3.2", env="OLLAMA_MODEL")
    openrouter_api_key: str = Field(default="", env="OPENROUTER_API_KEY")
    openrouter_model: str = Field(
        default="anthropic/claude-3-haiku", env="OPENROUTER_MODEL"
    )
    # LLM Provider settings (factory / ADR-0026)
    anthropic_api_key: str = Field(default="", env="ANTHROPIC_API_KEY")
    anthropic_model: str = Field(default="claude-sonnet-4-6", env="ANTHROPIC_MODEL")
    anthropic_max_tokens: int = Field(default=2048, env="ANTHROPIC_MAX_TOKENS")
    # Ollama settings (fallback only — optional, may not be running)
    ollama_url: str = Field(default="http://ollama:11434", env="OLLAMA_URL")
    ollama_timeout_seconds: int = Field(default=30, env="OLLAMA_TIMEOUT_SECONDS")
    # LLM routing
    llm_primary_provider: str = Field(default="anthropic", env="LLM_PRIMARY_PROVIDER")

    # RAG tuning
    max_context_chunks: int = 10
    max_tokens: int = 2048
    temperature: float = 0.1

    # Observability
    otel_endpoint: str = Field(
        default="http://otel-collector:4317",
        env="OTEL_EXPORTER_OTLP_ENDPOINT",
    )
    otel_enabled: bool = True

    model_config = {"env_file": ".env", "case_sensitive": False}


@lru_cache
def get_settings() -> Settings:
    """Return the cached singleton Settings instance.

    Returns:
        Settings: Loaded and validated settings object.
    """
    return Settings()
