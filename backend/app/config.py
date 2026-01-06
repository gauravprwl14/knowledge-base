from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional
from functools import lru_cache


class Settings(BaseSettings):
    # Application
    app_name: str = "Voice App API"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    # Database
    database_url: str = Field(
        default="postgresql://voiceapp:voiceapp@localhost:5432/voiceapp"
    )

    # RabbitMQ
    rabbitmq_url: str = Field(
        default="amqp://guest:guest@localhost:5672/"
    )

    # Transcription Providers
    groq_api_key: Optional[str] = None
    deepgram_api_key: Optional[str] = None

    # Translation Providers
    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None

    # Storage
    temp_upload_dir: str = "./temp/uploads"
    temp_processed_dir: str = "./temp/processed"
    models_dir: str = "./models"

    # File limits
    max_file_size_mb: int = 500
    allowed_extensions: str = "wav,mp3,m4a,mp4,mov,avi,mkv,webm,ogg,flac"

    # Workers
    worker_concurrency: int = 4

    # Job Monitoring
    job_timeout_minutes: int = 60  # Max time for a job to be in processing before considering it stale
    scheduler_check_interval_seconds: int = 300  # How often to check for stale jobs (5 minutes)
    enable_job_scheduler: bool = True  # Enable/disable the job monitoring scheduler

    # Cleanup
    temp_file_ttl_hours: int = 24

    @property
    def allowed_extensions_list(self) -> list[str]:
        return [ext.strip().lower() for ext in self.allowed_extensions.split(",")]

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
