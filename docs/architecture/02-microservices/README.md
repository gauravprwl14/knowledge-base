# Microservices Overview

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Service Catalog

The KMS consists of 8 microservices, each with a single responsibility:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            KMS MICROSERVICES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  API SERVICES (Synchronous)                                                  │
│  ┌─────────────────────────────────┐ ┌─────────────────────────────────┐    │
│  │         kms-api                 │ │        search-api               │    │
│  │        (NestJS)                 │ │          (Go)                   │    │
│  │                                 │ │                                 │    │
│  │  Port: 8000                     │ │  Port: 8001                     │    │
│  │  Role: Main API Gateway         │ │  Role: Search Operations        │    │
│  │  Owner: KMS Domain              │ │  Owner: Search Domain           │    │
│  └─────────────────────────────────┘ └─────────────────────────────────┘    │
│                                                                              │
│  WORKER SERVICES (Asynchronous)                                              │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐                │
│  │   scan-worker   │ │ embedding-worker│ │  dedup-worker   │                │
│  │    (Python)     │ │    (Python)     │ │    (Python)     │                │
│  │                 │ │                 │ │                 │                │
│  │ Queue: scan     │ │ Queue: embed    │ │ Queue: dedup    │                │
│  │ Role: Discovery │ │ Role: Vectorize │ │ Role: Duplicates│                │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘                │
│                                                                              │
│  ┌─────────────────┐ ┌─────────────────┐                                    │
│  │  junk-detector  │ │   voice-app     │                                    │
│  │    (Python)     │ │   (FastAPI)     │                                    │
│  │                 │ │                 │                                    │
│  │ Role: Cleanup   │ │ Queue: trans    │                                    │
│  │                 │ │ Role: Transcribe│                                    │
│  └─────────────────┘ └─────────────────┘                                    │
│                                                                              │
│  FRONTEND                                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                          web-ui                                  │        │
│  │                        (Next.js)                                 │        │
│  │                                                                  │        │
│  │  Port: 3000                                                      │        │
│  │  Role: User Interface                                            │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Service Summary

| Service | Language | Type | Port | Queue | Database Tables |
|---------|----------|------|------|-------|-----------------|
| [kms-api](./kms-api-service.md) | TypeScript | API | 8000 | - | auth_*, kms_* |
| [search-api](./search-api-service.md) | Go | API | 8001 | - | (read-only) |
| [scan-worker](./scan-worker-service.md) | Python | Worker | - | scan.queue | kms_sources, kms_files |
| [embedding-worker](./embedding-worker-service.md) | Python | Worker | - | embed.queue | kms_files, kms_embeddings |
| [dedup-worker](./dedup-worker-service.md) | Python | Worker | - | dedup.queue | kms_duplicates |
| [junk-detector](./junk-detector-service.md) | Python | Worker | - | - | kms_files |
| voice-app | Python | API+Worker | 8000 | trans.queue | voice_* |
| web-ui | TypeScript | Frontend | 3000 | - | - |

---

## Service Dependencies

```
                    ┌─────────────┐
                    │   web-ui    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌─────────┐  ┌──────────┐  ┌─────────┐
        │ kms-api │  │search-api│  │voice-app│
        └────┬────┘  └────┬─────┘  └────┬────┘
             │            │             │
    ┌────────┴────────────┴─────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│                  RabbitMQ                    │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐│
│  │ scan   │ │ embed  │ │ dedup  │ │ trans ││
│  └───┬────┘ └───┬────┘ └───┬────┘ └───┬───┘│
└──────┼──────────┼──────────┼──────────┼────┘
       │          │          │          │
       ▼          ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  scan-   │ │embedding-│ │  dedup-  │ │ voice-   │
│  worker  │ │ worker   │ │  worker  │ │  app     │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └──────────┘
     │            │            │
     └────────────┴────────────┘
                  │
    ┌─────────────┼─────────────┬─────────────┐
    │             │             │             │
    ▼             ▼             ▼             ▼
┌────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐
│PostgreSQL│ │  Qdrant │  │  Neo4j  │  │  MinIO │
└────────┘  └─────────┘  └─────────┘  └────────┘
```

---

## Communication Patterns

### 1. Synchronous (HTTP/REST)

Used for real-time user interactions:

```
Client ──HTTP──► kms-api ──HTTP──► search-api
                    │
                    └──HTTP──► voice-app (trigger transcription)
```

### 2. Asynchronous (RabbitMQ)

Used for background processing:

```
kms-api ──publish──► scan.queue ──consume──► scan-worker
                                                   │
scan-worker ──publish──► embed.queue ──consume──► embedding-worker
                                                        │
embedding-worker ──publish──► dedup.queue ──consume──► dedup-worker
```

### 3. Event-Driven (Webhooks)

Used for completion notifications:

```
voice-app ──webhook──► kms-api (transcription complete)
kms-api ──webhook──► external systems (scan complete)
```

---

## Scaling Guidelines

| Service | Min Instances | Max Instances | Scaling Trigger |
|---------|---------------|---------------|-----------------|
| kms-api | 2 | 8 | CPU > 70% |
| search-api | 2 | 8 | Latency > 400ms |
| scan-worker | 1 | 4 | Queue depth > 100 |
| embedding-worker | 2 | 8 | Queue depth > 500 |
| dedup-worker | 1 | 3 | Queue depth > 200 |
| junk-detector | 1 | 2 | Manual |
| web-ui | 2 | 4 | CPU > 70% |

---

## Health Check Endpoints

| Service | Endpoint | Method | Expected |
|---------|----------|--------|----------|
| kms-api | /health | GET | 200 OK |
| search-api | /health | GET | 200 OK |
| voice-app | /health | GET | 200 OK |
| web-ui | /api/health | GET | 200 OK |

Workers health is monitored via:
- RabbitMQ consumer status
- PostgreSQL connection check
- Periodic heartbeat messages

---

## Resource Allocation (Production)

| Service | CPU | Memory | Storage |
|---------|-----|--------|---------|
| kms-api | 2 cores | 2 GB | - |
| search-api | 4 cores | 4 GB | - |
| scan-worker | 2 cores | 2 GB | - |
| embedding-worker | 4 cores | 8 GB | 10 GB (models) |
| dedup-worker | 2 cores | 4 GB | - |
| junk-detector | 1 core | 1 GB | - |
| web-ui | 1 core | 1 GB | - |

---

## Related Documentation

- [Service Communication](./service-communication.md) - Inter-service communication patterns
- [kms-api Service](./kms-api-service.md) - Main API gateway
- [search-api Service](./search-api-service.md) - Search service
- [scan-worker Service](./scan-worker-service.md) - File scanner
- [embedding-worker Service](./embedding-worker-service.md) - Content processor
- [dedup-worker Service](./dedup-worker-service.md) - Deduplication
- [junk-detector Service](./junk-detector-service.md) - Junk detection
