from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache

class Settings(BaseSettings):
    service_name: str = "embed-worker"
    log_level: str = "INFO"
    database_url: str = Field(..., env="DATABASE_URL")
    rabbitmq_url: str = Field(default="amqp://guest:guest@localhost:5672/", env="RABBITMQ_URL")
    embed_queue: str = "kms.embed"
    voice_queue: str = Field(default="kms.voice", env="VOICE_QUEUE")
    dead_letter_exchange: str = "kms.dlx"
    prefetch_count: int = Field(default=8, env="EMBED_PREFETCH_COUNT")
    max_retries: int = 3
    # Chunking
    chunk_size: int = 512
    chunk_overlap: int = 64
    # Qdrant
    qdrant_url: str = Field(default="http://qdrant:6333", env="QDRANT_URL")
    qdrant_collection: str = "kms_chunks"
    embedding_enabled: bool = Field(default=True, env="EMBEDDING_ENABLED")
    # Mock flags — default True so dev/CI works without BGE-M3 or Qdrant running.
    # Set to false in production (docker-compose.kms.yml or .env).
    mock_embedding: bool = Field(default=True, env="MOCK_EMBEDDING")
    mock_qdrant: bool = Field(default=True, env="MOCK_QDRANT")
    # Model cache directory for BGE-M3 weights.
    # Defaults to /tmp/bge-m3-cache so the service always has a writable fallback.
    # Override with a volume-mounted path in production (MODEL_CACHE_DIR=/root/.cache/huggingface).
    model_cache_dir: str = Field(default="/tmp/bge-m3-cache", env="MODEL_CACHE_DIR")
    # Google Drive — needed when source_type == GOOGLE_DRIVE
    google_client_id: str = Field(default="", env="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field(default="", env="GOOGLE_CLIENT_SECRET")
    # Token encryption — must match NestJS TokenEncryptionService and scan-worker
    api_key_encryption_secret: str = Field(
        default="dev-secret-32-bytes-exactly!!!!!!",
        env="API_KEY_ENCRYPTION_SECRET",
    )

    model_config = {"env_file": ".env", "case_sensitive": False}

@lru_cache
def get_settings() -> Settings:
    return Settings()
