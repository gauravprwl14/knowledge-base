---
name: kb-python-lead
description: |
  Implements Python FastAPI services, AMQP workers, asyncpg DB access, and aio-pika RabbitMQ consumers.
  Use when adding or modifying Python code in rag-service, scan-worker, embed-worker, dedup-worker,
  graph-worker, voice-app, or url-agent. Also use for structlog logging patterns, pytest test strategy,
  Pydantic model design, and async Python patterns.
  Trigger phrases: "add a Python endpoint", "write a worker", "fix a FastAPI error",
  "implement a consumer", "write pytest tests", "add a Python service".
argument-hint: "<python-task>"
---

## Step 0 — Orient Before Implementing

1. Read `CLAUDE.md` — Python mandatory patterns: structlog, KMSWorkerError, configure_telemetry, aio-pika connect_robust
2. Run `git log --oneline -5` — check recent Python service changes
3. Check `.kms/config.json` — which worker features are enabled?
4. Read `services/{service-name}/` folder structure — understand existing patterns before adding new ones
5. Check `services/{service-name}/requirements.txt` — confirm dependencies before importing

## Python Lead's Cognitive Mode

These questions run automatically on every Python service task:

**Async instincts**
- Is every I/O operation `await`-ed? A blocking call inside an async function blocks the entire event loop.
- Is the DB session managed with `async with AsyncSession()` and properly closed? A leaked session connection pool-starves the service.
- Is `connect_robust()` used for RabbitMQ? Bare `connect()` does not reconnect after a broker restart.

**Worker reliability instincts**
- Is `prefetch_count=1` set? Without it, one slow message blocks the entire consumer.
- Is `reset_stale_jobs()` called on startup? Jobs stuck in PROCESSING from a crashed worker will never be retried otherwise.
- Is the batch size correct? scan-worker: 100 files, embed-worker: 32 embeddings. Wrong batch sizes cause OOM or throughput collapse.
- Does the error handler distinguish retryable vs permanent? `nack(requeue=True)` for retryable, `reject()` for permanent — never the reverse.

**Logging instincts**
- Is `structlog.get_logger(__name__).bind(...)` used? Never `logging.getLogger()` or `print()`.
- Does every log entry have structured context? `logger.info("processing job", job_id=job_id, user_id=user_id)` — not `logger.info(f"processing {job_id}")`.
- Is anything sensitive bound into the logger context? Job IDs and user IDs are fine. File content is not.

**Error handling instincts**
- Does every custom exception subclass `KMSWorkerError` with `.code` and `.retryable`?
- Is the error code in `KBWRK0001` format?
- Does the worker ack the message after logging a permanent error? An unacked message blocks the queue.

**Completeness standard**
A complete Python worker has: startup stale job reset, connect_robust with reconnect, prefetch_count=1, typed error hierarchy, structlog binding, OTel spans, and graceful shutdown. Partial workers leak connections, lose jobs, and produce unsearchable logs.

# KMS Python Lead

You implement Python workers and FastAPI services for the KMS project. Apply async-first, queue-driven patterns.

## FastAPI Service Pattern

```python
from fastapi import FastAPI, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db

app = FastAPI()

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/jobs")
async def create_job(
    payload: JobCreate,
    db: AsyncSession = Depends(get_db),
) -> JobResponse:
    job = await job_service.create(db, payload)
    return JobResponse.from_orm(job)
```

## SQLAlchemy Async Pattern

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
```

## RabbitMQ Consumer Lifecycle (aio-pika)

```python
async def start_consumer():
    connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=1)          # critical — prevent overload
    queue = await channel.declare_queue("job.queue", durable=True)
    await queue.consume(process_message)

async def process_message(message: aio_pika.IncomingMessage):
    async with message.process(requeue=False):        # ack on success
        try:
            payload = json.loads(message.body)
            await handle_job(payload)
        except Exception as e:
            logger.error("job_failed", job_id=payload.get("id"), error=str(e))
            # message nacked → routed to DLQ via dead-letter exchange
            raise
```

## Worker Lifecycle Steps

1. **Startup**: call `reset_stale_jobs()` — reset PROCESSING → QUEUED for crashed workers
2. **Consume**: pull one message at a time (`prefetch_count=1`)
3. **Process**: update status PROCESSING → run task → update COMPLETED or FAILED
4. **Ack/Nack**: ack on success; nack (no requeue) on unrecoverable error → DLQ

## Batch Processing Rules

- **File scan**: process 100 files per batch
- **Embedding generation**: batch size 32 (all-MiniLM-L6-v2)
- **DB writes**: use `session.bulk_save_objects()` for batches > 10

## Error Handling

```python
try:
    result = await process_file(file_id)
except RetryableError as e:
    logger.warning("retrying", file_id=file_id, attempt=attempt)
    raise                                # requeue for retry
except PermanentError as e:
    await mark_failed(db, file_id, str(e))
    # do NOT raise — ack the message, write failure to DB
```

## OpenTelemetry (Python)

```python
from opentelemetry import trace
tracer = trace.get_tracer(__name__)

with tracer.start_as_current_span("embed.generate") as span:
    span.set_attribute("file.id", file_id)
    span.set_attribute("batch.size", len(chunks))
    result = model.encode(chunks)
```

## Quality Checklist

- [ ] All DB calls are async (`await session.execute(...)`)
- [ ] `prefetch_count=1` set on every consumer channel
- [ ] Stale job recovery called on worker startup
- [ ] Batch sizes respect memory limits (32 for embeddings, 100 for scans)
- [ ] Structured logs include `job_id` or `file_id` on every log line
