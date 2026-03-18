from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    # Service
    service_name: str = "scan-worker"
    log_level: str = "INFO"

    # Database
    database_url: str = Field(..., env="DATABASE_URL")

    # RabbitMQ
    rabbitmq_url: str = Field(default="amqp://guest:guest@localhost:5672/", env="RABBITMQ_URL")
    scan_queue: str = "kms.scan"
    scan_dlq: str = "kms.scan.dlq"
    embed_queue: str = "kms.embed"
    dedup_queue: str = "kms.dedup"
    dead_letter_exchange: str = "kms.dlx"
    prefetch_count: int = 1
    max_retries: int = 3

    # Redis
    redis_url: str = Field(default="redis://redis:6379/0", env="REDIS_URL")

    # KMS API
    kms_api_url: str = Field(default="http://kms-api:8000", env="KMS_API_URL")

    # Google OAuth2
    google_client_id: str = Field(default="", env="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field(default="", env="GOOGLE_CLIENT_SECRET")
    google_redirect_uri: str = Field(
        default="http://localhost:8000/api/v1/sources/google-drive/callback",
        env="GOOGLE_REDIRECT_URI",
    )

    # Encryption — must match NestJS TokenEncryptionService
    api_key_encryption_secret: str = Field(
        default="dev-secret-32-bytes-exactly!!!!!!",
        env="API_KEY_ENCRYPTION_SECRET",
    )

    # Scan settings
    scan_batch_size: int = 50
    max_file_size_mb: int = 100
    supported_extensions: list[str] = [
        ".md", ".txt", ".pdf", ".docx", ".doc", ".xlsx", ".csv",
        ".pptx", ".png", ".jpg", ".jpeg", ".webp", ".html",
        ".json", ".yaml", ".yml", ".gif", ".mp3", ".wav", ".mp4", ".mov",
    ]

    # Obsidian / local vault settings
    vault_path: str = Field(default="/vault", env="VAULT_PATH")

    # Observability
    otel_endpoint: str = Field(default="http://otel-collector:4317", env="OTEL_EXPORTER_OTLP_ENDPOINT")
    otel_enabled: bool = True

    model_config = {"env_file": ".env", "case_sensitive": False}


@lru_cache
def get_settings() -> Settings:
    return Settings()
