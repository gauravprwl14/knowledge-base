"""Configuration for voice-app — loaded from environment variables via pydantic-settings."""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings sourced from environment variables.

    All fields with ``Field(..., env=...)`` are required unless a default is provided.
    """

    service_name: str = "voice-app"
    port: int = 8003
    log_level: str = "INFO"

    # Database
    database_url: str = Field(..., env="DATABASE_URL")

    # RabbitMQ
    rabbitmq_url: str = Field(
        default="amqp://guest:guest@rabbitmq:5672/",
        env="RABBITMQ_URL",
    )
    voice_queue: str = "kms.voice"
    voice_dlq: str = "kms.voice.dlq"
    embed_queue: str = "kms.embed"
    dead_letter_exchange: str = "kms.dlx"
    prefetch_count: int = 1

    # OTel
    otel_endpoint: str = Field(
        default="http://otel-collector:4317",
        env="OTEL_EXPORTER_OTLP_ENDPOINT",
    )
    otel_enabled: bool = True

    # Whisper
    whisper_model: str = Field(default="base", env="WHISPER_MODEL")
    whisper_device: str = Field(default="cpu", env="WHISPER_DEVICE")
    max_audio_size_mb: int = 500

    supported_audio_types: list[str] = [
        "audio/mpeg",
        "audio/wav",
        "audio/ogg",
        "audio/mp4",
        "video/mp4",
        "video/quicktime",
    ]

    model_config = {"env_file": ".env", "case_sensitive": False}


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance.

    Returns:
        The singleton Settings object for the process lifetime.
    """
    return Settings()


# Module-level singleton used by workers / services that cannot easily inject deps.
settings = get_settings()
