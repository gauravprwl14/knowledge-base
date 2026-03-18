from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    service_name: str = "rag-service"
    log_level: str = "INFO"
    database_url: str = Field(..., env="DATABASE_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", env="REDIS_URL")
    search_api_url: str = Field(default="http://search-api:8001/api/v1", env="SEARCH_API_URL")
    # LLM
    llm_enabled: bool = Field(default=False, env="LLM_ENABLED")
    llm_provider: str = Field(default="anthropic", env="LLM_PROVIDER")
    ollama_base_url: str = Field(default="http://ollama:11434", env="OLLAMA_BASE_URL")
    ollama_model: str = Field(default="llama3.2:3b", env="OLLAMA_MODEL")
    openrouter_api_key: str = Field(default="", env="OPENROUTER_API_KEY")
    openrouter_model: str = Field(default="anthropic/claude-3-haiku", env="OPENROUTER_MODEL")
    # LLM Provider settings (factory / ADR-0026)
    anthropic_api_key: str = Field(default="", env="ANTHROPIC_API_KEY")
    anthropic_model: str = Field(default="claude-opus-4-5", env="ANTHROPIC_MODEL")
    anthropic_max_tokens: int = Field(default=2048, env="ANTHROPIC_MAX_TOKENS")
    # Ollama settings (fallback only — optional, may not be running)
    ollama_url: str = Field(default="http://localhost:11434", env="OLLAMA_URL")
    ollama_timeout_seconds: int = Field(default=30, env="OLLAMA_TIMEOUT_SECONDS")
    # LLM routing
    llm_primary_provider: str = Field(default="anthropic", env="LLM_PRIMARY_PROVIDER")
    # RAG
    max_context_chunks: int = 10
    max_tokens: int = 2048
    temperature: float = 0.1

    model_config = {"env_file": ".env", "case_sensitive": False}


@lru_cache
def get_settings() -> Settings:
    return Settings()
