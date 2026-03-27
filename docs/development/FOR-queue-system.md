# FOR-queue-system — AMQP Workers: aio-pika, Quorum Queues, DLX

## 1. Business Use Case

KMS uses RabbitMQ as its message bus for all inter-service communication between the NestJS API and Python workers. The pipeline is: scan-worker discovers files → publishes to `kms.embed` → embed-worker processes files → graph-worker builds knowledge graph → dedup-worker deduplicates. aio-pika's `connect_robust` provides automatic reconnect so transient broker outages do not crash workers.

---

## 2. Flow Diagram

```mermaid
sequenceDiagram
    participant API as kms-api (NestJS)
    participant MQ as RabbitMQ
    participant SW as scan-worker
    participant EW as embed-worker
    participant DW as dedup-worker
    participant GW as graph-worker

    API->>MQ: publish ScanJobMessage → kms.scan
    MQ->>SW: deliver message
    SW->>MQ: publish FileDiscoveredMessage → kms.embed
    SW->>MQ: publish DedupCheckMessage → kms.dedup
    MQ->>EW: deliver FileDiscoveredMessage
    MQ->>DW: deliver DedupCheckMessage
    EW->>MQ: publish GraphJobMessage → kms.graph
    MQ->>GW: deliver GraphJobMessage
```

---

## 3. Code Structure

| File | Responsibility |
|------|---------------|
| `app/worker.py` | `run_worker()` coroutine — `connect_robust`, channel setup, consume loop |
| `app/handlers/{domain}_handler.py` | `handle(message)` — parse, process, ack/nack/reject |
| `app/models/messages.py` | Pydantic models for all AMQP payload schemas |
| `app/config.py` | `rabbitmq_url`, queue names (`scan_queue`, `embed_queue`, etc.) |

---

## 4. Key Methods

| Method | Description | Signature |
|--------|-------------|-----------|
| `aio_pika.connect_robust` | Reconnecting AMQP connection | `await connect_robust(url: str) -> RobustConnection` |
| `channel.declare_queue` | Idempotent queue declaration | `await channel.declare_queue(name, durable=True)` |
| `message.ack()` | Acknowledge successful processing | `await message.ack()` |
| `message.nack(requeue=True)` | Negative ack — return to queue for retry | `await message.nack(requeue=True)` |
| `message.reject(requeue=False)` | Terminal reject — send to DLX | `await message.reject(requeue=False)` |
| `exchange.publish` | Publish a new message downstream | `await exchange.publish(Message(...), routing_key=queue)` |

---

## 5. Error Cases

| Scenario | Action | Rationale |
|----------|--------|-----------|
| Malformed JSON / Pydantic validation failure | `reject(requeue=False)` | Retrying won't fix a malformed message |
| `KMSWorkerError(retryable=True)` | `nack(requeue=True)` | Transient error (network, OOM) — retry |
| `KMSWorkerError(retryable=False)` | `reject(requeue=False)` | Terminal error (missing file, bad config) — DLX |
| Unexpected `Exception` | `nack(requeue=True)` | Unknown error — retry; DLQ handles eventual failure |
| Queue publish failure | Raise `QueuePublishError(retryable=True)` | Caller nacks so retry includes re-publish |

---

## 6. Configuration

| Env Var | Description | Default |
|---------|-------------|---------|
| `RABBITMQ_URL` | Full AMQP connection URL | `amqp://guest:guest@localhost/` |
| `SCAN_QUEUE` | Queue name for scan jobs | `kms.scan` |
| `EMBED_QUEUE` | Queue name for embed jobs | `kms.embed` |
| `DEDUP_QUEUE` | Queue name for dedup checks | `kms.dedup` |
| `GRAPH_QUEUE` | Queue name for graph jobs | `kms.graph` |
| `VOICE_QUEUE` | Queue name for voice transcription | `kms.voice` |

---

## Worker Pattern (Canonical)

```python
import aio_pika
import structlog

logger = structlog.get_logger(__name__)

async def run_worker() -> None:
    """AMQP consumer loop — runs until cancelled."""
    connection = await aio_pika.connect_robust(
        settings.rabbitmq_url,
        reconnect_interval=5,   # seconds between reconnect attempts
    )
    async with connection:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=1)  # one message at a time per worker
        queue = await channel.declare_queue(
            settings.queue_name,
            durable=True,   # survive broker restart
        )
        handler = MyHandler(channel=channel)
        logger.info("Worker consuming queue", queue=settings.queue_name)
        async with queue.iterator() as q:
            async for message in q:
                await handler.handle(message)
```

## Handler Pattern (Canonical)

```python
async def handle(self, message: aio_pika.IncomingMessage) -> None:
    """Process one AMQP message."""
    # 1. Parse — reject immediately on bad messages (retrying won't help)
    try:
        payload = json.loads(message.body)
        job = MyJobMessage.model_validate(payload)
    except Exception as e:
        logger.error("Invalid message — dead-lettering", error=str(e))
        await message.reject(requeue=False)
        return

    try:
        await self._do_work(job)
        await message.ack()
    except KMSWorkerError as e:
        logger.error("Job failed", code=e.code, retryable=e.retryable, error=str(e))
        if e.retryable:
            await message.nack(requeue=True)
        else:
            await message.reject(requeue=False)
    except Exception as e:
        logger.error("Unexpected error", error=str(e))
        await message.nack(requeue=True)
```
