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
    embed_queue: str = "kms.embed"
    dedup_queue: str = "kms.dedup"
    dead_letter_exchange: str = "kms.dlx"
    prefetch_count: int = 1
    max_retries: int = 3

    # KMS API
    kms_api_url: str = Field(default="http://kms-api:8000", env="KMS_API_URL")

    # Scan settings
    scan_batch_size: int = 50
    max_file_size_mb: int = 100
    supported_extensions: list[str] = [
        ".pdf", ".docx", ".doc", ".txt", ".md", ".pptx", ".xlsx",
        ".png", ".jpg", ".jpeg", ".gif", ".mp3", ".wav", ".mp4", ".mov"
    ]

    # Observability
    otel_endpoint: str = Field(default="http://otel-collector:4317", env="OTEL_EXPORTER_OTLP_ENDPOINT")
    otel_enabled: bool = True

    model_config = {"env_file": ".env", "case_sensitive": False}


@lru_cache
def get_settings() -> Settings:
    return Settings()
