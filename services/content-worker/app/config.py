"""
Configuration for content-worker.

All settings are loaded from environment variables. Required settings raise
a ValidationError at startup if absent — fail fast, never silently.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str

    # ── RabbitMQ ─────────────────────────────────────────────────────────────
    rabbitmq_url: str
    content_queue: str = "kms.content"
    content_dlx: str = "kms.content.dlx"
    content_retry_queue: str = "kms.content.retry"

    # ── Redis (rate limiter for YouTube ingestion) ────────────────────────────
    redis_url: str = "redis://redis:6379/0"

    # ── Anthropic ─────────────────────────────────────────────────────────────
    anthropic_api_key: str

    # ── Firecrawl (optional — falls back to requests+BS4 if absent) ──────────
    firecrawl_api_key: str = ""
    # Base URL for the Firecrawl API. Defaults to the Firecrawl cloud service.
    # Override with http://localhost:3002 when running self-hosted Firecrawl
    # via devops/compose/stacks/firecrawl.yml.
    firecrawl_api_url: str = "https://api.firecrawl.dev"

    # ── voice-app (Whisper) ───────────────────────────────────────────────────
    voice_app_url: str = "http://voice-app:8003"

    # ── Worker ────────────────────────────────────────────────────────────────
    # Keep at 1 until distributed locking is implemented (TODO-009)
    content_worker_concurrency: int = 1

    # Feature flag — allows disabling content module without redeployment
    content_module_enabled: bool = True

    # ── Encryption (AES-256-GCM for Hashnode API key storage) ────────────────
    # 32-byte hex key. Generate: openssl rand -hex 32
    # Required if users can store Hashnode API keys; may be empty in dev.
    encryption_key: str = ""

    # ── OTel ─────────────────────────────────────────────────────────────────
    otel_enabled: bool = False
    otel_exporter_otlp_endpoint: str = "http://otel-collector:4317"
    otel_service_name: str = "content-worker"


settings = Settings()
