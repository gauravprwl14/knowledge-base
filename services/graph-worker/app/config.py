"""
Configuration for graph-worker.

All values are read from environment variables (or a .env file).
Use get_settings() everywhere — the result is cached via lru_cache.
"""

from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Runtime configuration for the graph-worker service.

    Attributes:
        service_name: OTel service.name and log identifier.
        log_level: Python log level string (DEBUG, INFO, WARNING, ERROR).
        database_url: asyncpg-compatible PostgreSQL DSN for chunk retrieval.
        rabbitmq_url: AMQP connection URL for RabbitMQ.
        graph_queue: Name of the queue this worker consumes from.
        dead_letter_exchange: RabbitMQ DLX for unprocessable messages.
        prefetch_count: Per-channel QoS prefetch limit.
        max_retries: Maximum delivery retries before dead-lettering.
        neo4j_uri: Bolt URI for the Neo4j instance.
        neo4j_user: Neo4j username.
        neo4j_password: Neo4j password (stored as SecretStr).
        otel_endpoint: OTLP gRPC collector endpoint.
        otel_enabled: When False, OTel instrumentation is skipped entirely.
    """

    # Service identity
    service_name: str = "graph-worker"
    log_level: str = "INFO"

    # Database (asyncpg — used to load kms_chunks)
    database_url: SecretStr = Field(..., env="DATABASE_URL")

    # RabbitMQ
    rabbitmq_url: SecretStr = Field(
        default=SecretStr("amqp://guest:guest@localhost:5672/"),
        env="RABBITMQ_URL",
    )
    graph_queue: str = "kms.graph"
    dead_letter_exchange: str = "kms.dlx"
    prefetch_count: int = 5
    max_retries: int = 3

    # Neo4j
    neo4j_uri: str = Field(default="bolt://localhost:7687", env="NEO4J_URI")
    neo4j_user: str = Field(default="neo4j", env="NEO4J_USER")
    neo4j_password: SecretStr = Field(
        default=SecretStr("neo4j"),
        env="NEO4J_PASSWORD",
    )

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
