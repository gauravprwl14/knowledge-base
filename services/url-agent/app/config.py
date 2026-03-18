"""url-agent configuration via environment variables."""
from __future__ import annotations

from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Runtime configuration for the url-agent service."""

    # Service
    app_name: str = Field(default="url-agent", env="APP_NAME")
    port: int = Field(default=8004, env="PORT")
    log_level: str = Field(default="info", env="LOG_LEVEL")

    # RabbitMQ — for publishing extracted content to the embed pipeline
    rabbitmq_url: str = Field(default="amqp://guest:guest@localhost:5672/", env="RABBITMQ_URL")
    embed_queue: str = Field(default="kms.embed", env="EMBED_QUEUE")

    # PostgreSQL — for creating kms_files records for extracted content
    database_url: str = Field(default="", env="DATABASE_URL")

    # Mock modes — enabled by default for dev without external tools
    mock_youtube: bool = Field(default=True, env="MOCK_YOUTUBE")
    mock_web: bool = Field(default=True, env="MOCK_WEB")

    # Extraction limits
    max_transcript_chars: int = Field(default=50_000, env="MAX_TRANSCRIPT_CHARS")
    max_web_chars: int = Field(default=20_000, env="MAX_WEB_CHARS")

    # OTel
    otel_enabled: bool = Field(default=False, env="OTEL_ENABLED")
    otel_endpoint: str = Field(default="http://localhost:4317", env="OTEL_EXPORTER_OTLP_ENDPOINT")

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    """Return cached Settings instance."""
    return Settings()
