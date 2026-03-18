# FOR-python-patterns — FastAPI and Python Worker Service Patterns

## 1. Business Use Case

KMS has six Python services: four AMQP worker services (scan, embed, dedup, graph) and two FastAPI services (rag-service, voice-app), plus url-agent. Every service follows the same structural conventions so engineers can navigate any service without context-switching. This guide is the canonical reference for all Python service code.

---

## 2. Flow Diagram

```mermaid
flowchart TD
    A[main.py] -->|configure_telemetry first| B[telemetry.py]
    A -->|lifespan context manager| C[startup: pool + worker task]
    C --> D[app routes or AMQP consumer]
    D --> E[handler / endpoint]
    E -->|structlog| F[structured logs]
    E -->|typed errors| G[errors.py]
    E -->|asyncpg / aio-pika| H[DB / Queue]
```

---

## 3. Code Structure

| File | Responsibility |
|------|---------------|
| `app/main.py` | FastAPI app factory; OTel config; lifespan hook; health endpoints |
| `app/config.py` | `Settings` Pydantic model; `get_settings()` cached factory |
| `app/telemetry.py` | `configure_telemetry(service_name)` — OTel SDK setup |
| `app/errors.py` | Typed error hierarchy; all errors carry `.code` and `.retryable` |
| `app/worker.py` | `run_worker()` coroutine: aio-pika connect_robust + consume loop |
| `app/handlers/*.py` | AMQP message handlers; one `handle(message)` async method |
| `app/services/*.py` | Business logic; no direct AMQP/HTTP awareness |
| `app/models/messages.py` | Pydantic message schemas for AMQP payloads |
| `app/api/v1/router.py` | FastAPI router with all v1 endpoints |

---

## 4. Key Methods

| Method | Description | Signature |
|--------|-------------|-----------|
| `configure_telemetry` | Register OTel SDK — call BEFORE route imports | `configure_telemetry(service_name: str) -> None` |
| `get_settings` | Cached settings from env vars via `@lru_cache` | `get_settings() -> Settings` |
| `run_worker` | aio-pika consumer loop with `connect_robust` | `async run_worker() -> None` |
| `handler.handle` | Process one AMQP message; ack/nack/reject | `async handle(message: IncomingMessage) -> None` |

---

## 5. Error Cases

| Error Code | HTTP Status | Description | Handling |
|------------|-------------|-------------|----------|
| `KBWRK01xx` | — | Scan-worker errors (connector, discovery, queue) | nack/reject based on `.retryable` |
| `KBWRK02xx` | — | Dedup-worker errors (Redis, DB) | nack/reject based on `.retryable` |
| `KBWRK03xx` | — | Graph-worker errors (Neo4j, NER, status) | nack/reject based on `.retryable` |
| `KBRAG0001–0007` | 400/503/200 | RAG service errors | FastAPI exception handler returns JSON |

**AMQP error strategy**:
- `KMSWorkerError(retryable=True)` → `await message.nack(requeue=True)`
- `KMSWorkerError(retryable=False)` → `await message.reject(requeue=False)` (dead-letter)
- Malformed message (parse failure) → `await message.reject(requeue=False)` immediately
- Unexpected `Exception` → `await message.nack(requeue=True)` (may eventually reach DLQ)

---

## 6. Configuration

| Env Var | Description | Default |
|---------|-------------|---------|
| `RABBITMQ_URL` | aio-pika connection URL | `amqp://guest:guest@localhost/` |
| `DATABASE_URL` | asyncpg connection URL | `postgresql://...` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTel collector endpoint | `http://localhost:4317` |
| `SERVICE_NAME` | Service identifier in logs/traces | per-service default |

---

## Mandatory Patterns

### 1. OTel must be first

```python
# main.py — ALWAYS first, before any other imports
from app.telemetry import configure_telemetry
configure_telemetry("my-service")

# Only then import routes/workers
from app.api.v1.router import api_router  # noqa: E402
```

### 2. Structlog — not logging.getLogger

```python
import structlog
logger = structlog.get_logger(__name__)
# Bind contextual fields at the start of a handler
log = logger.bind(file_id=file_id, source_id=source_id)
log.info("Processing file", step="extract")
```

### 3. Settings via Pydantic + lru_cache

```python
from functools import lru_cache
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    rabbitmq_url: str = "amqp://guest:guest@localhost/"
    database_url: str

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

### 4. aio-pika with connect_robust

```python
import aio_pika

async def run_worker() -> None:
    connection = await aio_pika.connect_robust(settings.rabbitmq_url)
    async with connection:
        channel = await connection.channel()
        queue = await channel.declare_queue(settings.queue_name, durable=True)
        async with queue.iterator() as q:
            async for message in q:
                async with message.process(requeue=True):
                    await handler.handle(message)
```

### 5. Google-style docstrings on all public defs

```python
async def process_file(file_path: str, source_id: str) -> int:
    """Process a file and return the chunk count.

    Args:
        file_path: Absolute path to the file on disk.
        source_id: UUID of the owning source.

    Returns:
        Number of chunks produced from the file.

    Raises:
        ExtractionError: If text extraction fails.
    """
```
