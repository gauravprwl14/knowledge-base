---
name: kb-python-lead
description: Python worker services, FastAPI endpoints, async job processing
argument-hint: "<python-task>"
---

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
