# 0006 — aio-pika over Celery for Python Workers

- **Status**: Accepted
- **Date**: 2026-03-17
- **Deciders**: Architecture Team
- **Tags**: [python, workers, rabbitmq, async]

## Context and Problem Statement

Python worker services need to consume messages from RabbitMQ queues for file scanning, embedding generation, deduplication, and graph building. The choice of AMQP client library determines how we handle connection resilience, message acknowledgment, dead-letter queues, and async concurrency.

## Decision Drivers

- Native async/await (no threading workarounds)
- Automatic reconnection on broker restart
- Manual message acknowledgment control (ack/nack/reject)
- Dead-letter queue routing
- W3C trace context propagation via AMQP headers

## Considered Options

- Option A: `aio-pika` (async AMQP library)
- Option B: Celery + `kombu`
- Option C: `dramatiq`
- Option D: `arq` (Redis-backed)

## Decision Outcome

Chosen: **Option A — aio-pika** — Native asyncio, `connect_robust()` for transparent reconnection, fine-grained `ack`/`nack`/`reject` control, and direct AMQP header access for W3C trace propagation.

### Consequences

**Good:**
- `connect_robust()` handles broker restarts, network partitions transparently
- `message.process()` context manager ensures correct ack/nack even on exception
- Direct header access enables W3C traceparent injection/extraction
- Quorum queue support via `x-queue-type: quorum` argument

**Bad / Trade-offs:**
- No built-in task registry (define handler functions manually)
- No built-in retry counting (implement via message headers or DLX policy)
- Less "batteries included" than Celery

## Pros and Cons of the Options

### Option A: aio-pika

- ✅ Native asyncio — no thread pool workaround
- ✅ `connect_robust()` — transparent reconnection
- ✅ Full AMQP control — quorum queues, DLX, priorities
- ✅ Direct header access for OTel trace propagation
- ❌ No built-in task registry or retry counting
- ❌ More boilerplate than Celery for simple use cases

### Option B: Celery

- ✅ Mature, feature-rich task framework
- ✅ Built-in retry, rate limiting, scheduling
- ❌ Uses threads internally — mixes poorly with asyncio
- ❌ Celery + RabbitMQ has known reliability issues with `acks_late`
- ❌ Poor OTel trace propagation support
- ❌ Heavyweight — pulls in many dependencies

### Option C: dramatiq

- ✅ Clean, simple API
- ✅ Better async support than Celery
- ❌ Smaller community
- ❌ Limited AMQP feature access

### Option D: arq

- ✅ Redis-backed — very simple setup
- ❌ Requires Redis instead of RabbitMQ (we already use RabbitMQ)
- ❌ No dead-letter queue support
- ❌ No message priority support
