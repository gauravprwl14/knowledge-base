from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache

class Settings(BaseSettings):
    service_name: str = "embed-worker"
    log_level: str = "INFO"
    database_url: str = Field(..., env="DATABASE_URL")
    rabbitmq_url: str = Field(default="amqp://guest:guest@localhost:5672/", env="RABBITMQ_URL")
    embed_queue: str = "kms.embed"
    dead_letter_exchange: str = "kms.dlx"
    prefetch_count: int = 2
    max_retries: int = 3
    # Chunking
    chunk_size: int = 512
    chunk_overlap: int = 64
    # Qdrant (future)
    qdrant_url: str = Field(default="http://qdrant:6333", env="QDRANT_URL")
    qdrant_collection: str = "kms_files"
    embedding_enabled: bool = Field(default=False, env="EMBEDDING_ENABLED")

    model_config = {"env_file": ".env", "case_sensitive": False}

@lru_cache
def get_settings() -> Settings:
    return Settings()
