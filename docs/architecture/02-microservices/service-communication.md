# Service Communication Patterns

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

This document describes the communication patterns between KMS microservices, including synchronous HTTP calls, asynchronous message queuing, and webhook notifications.

---

## Communication Matrix

| From | To | Pattern | Protocol | Purpose |
|------|-----|---------|----------|---------|
| web-ui | kms-api | Sync | HTTP/REST | User operations |
| web-ui | search-api | Sync | HTTP/REST | Search queries |
| kms-api | search-api | Sync | HTTP/REST | Internal search |
| kms-api | voice-app | Sync | HTTP/REST | Transcription trigger |
| kms-api | RabbitMQ | Async | AMQP | Job publishing |
| scan-worker | RabbitMQ | Async | AMQP | Job consume/publish |
| embedding-worker | RabbitMQ | Async | AMQP | Job consume/publish |
| dedup-worker | RabbitMQ | Async | AMQP | Job consume |
| voice-app | kms-api | Webhook | HTTP | Transcription complete |

---

## 1. Synchronous Communication (HTTP/REST)

### Request Flow

```
┌─────────┐     ┌─────────┐     ┌──────────┐
│ Client  │────►│ Nginx   │────►│ Service  │
│         │◄────│         │◄────│          │
└─────────┘     └─────────┘     └──────────┘
```

### API Gateway Routing

```nginx
# Nginx configuration
location /api/v1/ {
    proxy_pass http://kms-api:8000;
}

location /search/ {
    proxy_pass http://search-api:8001;
}

location /voice/ {
    proxy_pass http://voice-app:8000;
}
```

### Service-to-Service Calls

```
┌─────────┐     HTTP      ┌──────────┐
│ kms-api │──────────────►│search-api│
│         │◄──────────────│          │
└─────────┘   Response    └──────────┘
```

**Implementation Pattern (TypeScript)**:

```typescript
// High-level - NOT executable
class SearchApiClient {
    private baseUrl: string;
    private httpClient: HttpClient;

    async search(query: SearchRequest): Promise<SearchResponse> {
        // Build request
        const url = `${this.baseUrl}/api/v1/search`;

        // Execute with timeout and retry
        const response = await this.httpClient.post(url, query, {
            timeout: 5000,
            retries: 3,
            retryDelay: 1000
        });

        return response.data;
    }
}
```

### Timeout Configuration

| Caller | Callee | Timeout | Retries |
|--------|--------|---------|---------|
| web-ui | kms-api | 30s | 0 |
| web-ui | search-api | 10s | 0 |
| kms-api | search-api | 5s | 3 |
| kms-api | voice-app | 10s | 2 |

---

## 2. Asynchronous Communication (RabbitMQ)

### Queue Architecture

```
┌────────────────────────────────────────────────────────────┐
│                       RabbitMQ                              │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  EXCHANGE: kms.direct (type: direct)                       │
│                                                             │
│  ┌─────────────────┐    routing_key: scan                  │
│  │   scan.queue    │◄──────────────────────────────────────│
│  │ (durable, x10)  │                                       │
│  └─────────────────┘                                       │
│                                                             │
│  ┌─────────────────┐    routing_key: embed                 │
│  │   embed.queue   │◄──────────────────────────────────────│
│  │ (durable, x10)  │                                       │
│  └─────────────────┘                                       │
│                                                             │
│  ┌─────────────────┐    routing_key: dedup                 │
│  │   dedup.queue   │◄──────────────────────────────────────│
│  │ (durable, x10)  │                                       │
│  └─────────────────┘                                       │
│                                                             │
│  ┌─────────────────┐    routing_key: trans                 │
│  │   trans.queue   │◄──────────────────────────────────────│
│  │ (durable, x10)  │                                       │
│  └─────────────────┘                                       │
│                                                             │
│  DEAD LETTER EXCHANGE: kms.dlx                             │
│  ┌─────────────────┐                                       │
│  │  failed.queue   │ (stores failed messages)              │
│  └─────────────────┘                                       │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### Message Flow

```
                              ┌─────────────────┐
                              │    kms-api      │
                              │   (Publisher)   │
                              └────────┬────────┘
                                       │
                              publish("scan", message)
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                          RabbitMQ                                │
│  ┌────────────┐                                                 │
│  │ scan.queue │────────────────────────────────────────────────┐│
│  └────────────┘                                                ││
│       │                                                        ││
│       │ consume                                                ││
│       ▼                                                        ││
│  ┌────────────┐                                                ││
│  │scan-worker │                                                ││
│  └────────────┘                                                ││
│       │                                                        ││
│       │ publish("embed", new_message)                          ││
│       ▼                                                        ││
│  ┌─────────────┐                                               ││
│  │ embed.queue │───────────────────────────────────────────────┘│
│  └─────────────┘                                                │
│       │                                                         │
│       │ consume                                                 │
│       ▼                                                         │
│  ┌────────────────┐                                             │
│  │embedding-worker│                                             │
│  └────────────────┘                                             │
│       │                                                         │
│       │ publish("dedup", new_message)                           │
│       ▼                                                         │
│  ┌─────────────┐                                                │
│  │ dedup.queue │                                                │
│  └─────────────┘                                                │
└─────────────────────────────────────────────────────────────────┘
```

### Message Schema

```json
{
  "message_id": "uuid",
  "event_type": "FILE_INDEXED",
  "correlation_id": "uuid",
  "timestamp": "2026-01-07T10:00:00Z",
  "version": "1.0",
  "payload": {
    "file_id": "uuid",
    "source_id": "uuid",
    "user_id": "uuid",
    "action": "process"
  },
  "metadata": {
    "retry_count": 0,
    "max_retries": 3,
    "priority": 5
  }
}
```

### Event Types

| Event | Queue | Publisher | Consumer |
|-------|-------|-----------|----------|
| SCAN_REQUESTED | scan.queue | kms-api | scan-worker |
| FILE_DISCOVERED | embed.queue | scan-worker | embedding-worker |
| FILE_EMBEDDED | dedup.queue | embedding-worker | dedup-worker |
| TRANSCRIBE_REQUESTED | trans.queue | kms-api | voice-app |

### Publishing Pattern (Python)

```python
# High-level - NOT executable

class MessagePublisher:
    def __init__(self, connection: aio_pika.Connection):
        self.connection = connection
        self.channel = None
        self.exchange = None

    async def setup(self):
        self.channel = await self.connection.channel()
        self.exchange = await self.channel.declare_exchange(
            "kms.direct",
            type=aio_pika.ExchangeType.DIRECT,
            durable=True
        )

    async def publish(
        self,
        routing_key: str,
        event_type: str,
        payload: dict,
        priority: int = 5
    ):
        message = {
            "message_id": str(uuid.uuid4()),
            "event_type": event_type,
            "correlation_id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat(),
            "payload": payload,
            "metadata": {
                "retry_count": 0,
                "priority": priority
            }
        }

        await self.exchange.publish(
            aio_pika.Message(
                body=json.dumps(message).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                priority=priority
            ),
            routing_key=routing_key
        )
```

### Consuming Pattern (Python)

```python
# High-level - NOT executable

class MessageConsumer:
    def __init__(self, connection: aio_pika.Connection, queue_name: str):
        self.connection = connection
        self.queue_name = queue_name

    async def setup(self):
        channel = await self.connection.channel()
        await channel.set_qos(prefetch_count=1)

        queue = await channel.declare_queue(
            self.queue_name,
            durable=True,
            arguments={
                "x-max-priority": 10,
                "x-dead-letter-exchange": "kms.dlx"
            }
        )

        await queue.consume(self.process_message)

    async def process_message(self, message: aio_pika.IncomingMessage):
        async with message.process():
            try:
                data = json.loads(message.body.decode())
                await self.handle_event(data)
            except Exception as e:
                # Check retry count
                retry_count = data.get("metadata", {}).get("retry_count", 0)
                if retry_count < 3:
                    # Republish with incremented retry
                    await self.republish_with_retry(data)
                else:
                    # Let it go to DLX
                    raise

    async def handle_event(self, data: dict):
        # Implement in subclass
        raise NotImplementedError
```

---

## 3. Webhook Communication

### Outgoing Webhooks

KMS sends webhooks for:
- Scan completion
- Transcription completion
- Duplicate detection

```
┌─────────┐     HTTP POST     ┌────────────────┐
│ kms-api │──────────────────►│ External System│
│         │                   │  (webhook_url) │
└─────────┘                   └────────────────┘
```

**Webhook Payload**:

```json
POST {webhook_url}
Content-Type: application/json
X-KMS-Signature: sha256=...

{
  "event": "scan.completed",
  "timestamp": "2026-01-07T10:00:00Z",
  "data": {
    "scan_job_id": "uuid",
    "source_id": "uuid",
    "files_discovered": 1500,
    "files_processed": 1500,
    "status": "completed"
  }
}
```

### Incoming Webhooks

KMS receives webhooks from:
- voice-app (transcription complete)

```
┌───────────┐     HTTP POST     ┌─────────┐
│ voice-app │──────────────────►│ kms-api │
│           │                   │         │
└───────────┘                   └─────────┘
```

**Endpoint**: `POST /api/v1/webhooks/voice-app`

**Payload**:

```json
{
  "event": "transcription.completed",
  "job_id": "voice-app-job-uuid",
  "transcription": {
    "text": "...",
    "confidence": 0.95,
    "duration_seconds": 120
  }
}
```

---

## 4. Error Handling

### Synchronous Error Handling

```
┌─────────┐                    ┌─────────┐
│ Client  │────Request────────►│ Service │
│         │                    │         │
│         │◄──4xx/5xx Error────│         │
└─────────┘                    └─────────┘
```

**Standard Error Response**:

```json
{
  "error": {
    "code": "KMS2001",
    "message": "Source not found",
    "details": {
      "source_id": "uuid"
    }
  },
  "request_id": "req-uuid",
  "timestamp": "2026-01-07T10:00:00Z"
}
```

### Asynchronous Error Handling

```
                    ┌────────────────────────┐
                    │       Processing       │
                    └───────────┬────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
         Success            Retry             Failure
              │                 │                 │
              ▼                 ▼                 ▼
    ┌─────────────────┐ ┌─────────────┐ ┌─────────────┐
    │  Mark Complete  │ │  Republish  │ │  Send to    │
    │  in Database    │ │  with delay │ │  DLX        │
    └─────────────────┘ └─────────────┘ └─────────────┘
```

**Retry Strategy**:
- Max retries: 3
- Delay: Exponential backoff (1s, 2s, 4s)
- After max retries: Message goes to Dead Letter Queue

---

## 5. Service Discovery

### Docker Compose DNS

Services discover each other using Docker's internal DNS:

```yaml
# Service can reach others by name
kms-api:
  environment:
    - SEARCH_API_URL=http://search-api:8001
    - VOICE_APP_URL=http://voice-app:8000
    - RABBITMQ_URL=amqp://rabbitmq:5672
```

### Health Checks

Each service exposes `/health` for readiness checks:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
  interval: 10s
  timeout: 5s
  retries: 3
```

---

## 6. Circuit Breaker

### Implementation

```
     ┌────────────────────────────────────────────┐
     │            Circuit Breaker                 │
     │                                            │
     │  States: CLOSED → OPEN → HALF_OPEN        │
     │                                            │
     │  CLOSED: Normal operation                  │
     │  OPEN: Fast fail (after threshold)         │
     │  HALF_OPEN: Test with limited requests     │
     │                                            │
     │  Failure Threshold: 5 consecutive          │
     │  Open Duration: 60 seconds                 │
     │  Half-Open Test: 1 request                 │
     └────────────────────────────────────────────┘
```

**Pattern (TypeScript)**:

```typescript
// High-level - NOT executable

class CircuitBreaker {
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    private failureCount = 0;
    private lastFailureTime: Date | null = null;

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === 'OPEN') {
            if (this.shouldAttemptReset()) {
                this.state = 'HALF_OPEN';
            } else {
                throw new CircuitOpenError();
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    private onSuccess(): void {
        this.failureCount = 0;
        this.state = 'CLOSED';
    }

    private onFailure(): void {
        this.failureCount++;
        this.lastFailureTime = new Date();
        if (this.failureCount >= 5) {
            this.state = 'OPEN';
        }
    }

    private shouldAttemptReset(): boolean {
        const now = new Date();
        const elapsed = now.getTime() - (this.lastFailureTime?.getTime() || 0);
        return elapsed > 60000; // 60 seconds
    }
}
```

---

## 7. Request Tracing

### Correlation ID Propagation

```
┌─────────┐  X-Correlation-ID  ┌─────────┐  correlation_id  ┌─────────┐
│ Client  │───────────────────►│ kms-api │─────────────────►│ Worker  │
│         │    abc123          │         │    abc123        │         │
└─────────┘                    └─────────┘                  └─────────┘
                                    │
                                    │ X-Correlation-ID: abc123
                                    ▼
                               ┌──────────┐
                               │search-api│
                               └──────────┘
```

**Logging with Correlation ID**:

```json
{
  "timestamp": "2026-01-07T10:00:00Z",
  "level": "INFO",
  "service": "kms-api",
  "correlation_id": "abc123",
  "message": "Search request received",
  "data": {
    "query": "machine learning"
  }
}
```

---

## 8. Rate Limiting

### Per-Service Limits

| Service | Limit | Window |
|---------|-------|--------|
| kms-api | 1000 req | 1 min |
| search-api | 500 req | 1 min |
| voice-app | 100 req | 1 min |

### Implementation (Redis)

```typescript
// High-level - NOT executable

class RateLimiter {
    private redis: RedisClient;

    async checkLimit(apiKey: string, limit: number): Promise<boolean> {
        const key = `ratelimit:${apiKey}`;
        const current = await this.redis.incr(key);

        if (current === 1) {
            await this.redis.expire(key, 60);
        }

        return current <= limit;
    }
}
```

### Rate Limit Headers

```
HTTP/1.1 200 OK
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1704621660
```
