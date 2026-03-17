"""
Configuration for dedup-worker.

All values are read from environment variables (or a .env file).
Use get_settings() everywhere — the result is cached via lru_cache.
"""

from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Runtime configuration for the dedup-worker service.

    Attributes:
        service_name: OTel service.name and log identifier.
        log_level: Python log level string (DEBUG, INFO, WARNING, ERROR).
        database_url: asyncpg-compatible PostgreSQL DSN.
        rabbitmq_url: AMQP connection URL for RabbitMQ.
        dedup_queue: Name of the queue this worker consumes from.
        dead_letter_exchange: RabbitMQ DLX for unprocessable messages.
        prefetch_count: Per-channel QoS prefetch limit.
        max_retries: Maximum delivery retries before dead-lettering.
        redis_url: Redis connection URL for dedup hash cache.
        redis_ttl_seconds: TTL applied to new hash cache entries (7 days default).
        kms_api_url: Base URL for internal kms-api webhooks.
        otel_endpoint: OTLP gRPC collector endpoint.
        otel_enabled: When False, OTel instrumentation is skipped entirely.
    """

    # Service identity
    service_name: str = "dedup-worker"
    log_level: str = "INFO"

    # Database (asyncpg)
    database_url: SecretStr = Field(..., env="DATABASE_URL")

    # RabbitMQ
    rabbitmq_url: SecretStr = Field(
        default=SecretStr("amqp://guest:guest@localhost:5672/"),
        env="RABBITMQ_URL",
    )
    dedup_queue: str = "kms.dedup"
    dead_letter_exchange: str = "kms.dlx"
    prefetch_count: int = 5
    max_retries: int = 3

    # Redis
    redis_url: str = Field(default="redis://localhost:6379/0", env="REDIS_URL")
    redis_ttl_seconds: int = 604_800  # 7 days

    # KMS API (internal webhook — stubbed for now)
    kms_api_url: str = Field(default="http://kms-api:8000", env="KMS_API_URL")

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
