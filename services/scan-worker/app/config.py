"""Configuration for scan-worker.

All values are read from environment variables (or a .env file).
Use ``get_settings()`` everywhere — the result is cached via ``lru_cache``.
"""
from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    """Runtime configuration for the scan-worker.

    All fields are sourced from environment variables or the ``.env`` file.
    Secrets (``api_key_encryption_secret``, ``google_client_secret``) must
    never be hard-coded and must not appear in structured logs.

    Attributes:
        service_name: OTel service.name and log identifier.
        log_level: Python log level (DEBUG, INFO, WARNING, ERROR).
        database_url: asyncpg-compatible PostgreSQL DSN.
        rabbitmq_url: AMQP broker URL for aio_pika connect_robust.
        scan_queue: Queue name for incoming scan job messages.
        embed_queue: Queue name for outbound FileDiscoveredMessages.
        dedup_queue: Queue name for outbound DedupCheckMessages.
        redis_url: Redis connection URL for progress tracking.
        kms_api_url: Base URL for the kms-api (HTTP fallback for job status).
        google_client_id: Google OAuth2 client ID for Drive sources.
        google_client_secret: Google OAuth2 client secret (keep out of logs).
        api_key_encryption_secret: AES-256-GCM key that must match the NestJS
            TokenEncryptionService value (keep out of logs).
        scan_batch_size: Number of file records to upsert in a single DB batch.
        max_file_size_mb: Files larger than this value are skipped during scan.
        vault_path: Host path mounted for local/Obsidian vault access.
        otel_endpoint: OTLP gRPC collector endpoint.
        otel_enabled: When False, OTel instrumentation is disabled.
    """

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
    """Return the cached singleton Settings instance.

    Returns:
        Settings: Loaded and validated settings object.
    """
    return Settings()
