# High-Level System Architecture

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## System Overview

The Knowledge Management System (KMS) is a distributed, event-driven architecture designed to index, search, and manage files across multiple sources. The system follows a microservices pattern with clear separation of concerns.

### Core Design Goals

1. **Scalability** - Horizontal scaling of workers and API services
2. **Resilience** - Fault tolerance through message queues and retries
3. **Extensibility** - Plugin architecture for new sources and providers
4. **Performance** - Sub-500ms search latency at scale
5. **Privacy** - Local-first processing with optional cloud enhancement

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐                   │
│  │     Web UI       │  │    CLI Tool      │  │   External Apps  │                   │
│  │    (Next.js)     │  │    (Python)      │  │   (REST API)     │                   │
│  │                  │  │                  │  │                  │                   │
│  │  • Dashboard     │  │  • kms-scan      │  │  • Integrations  │                   │
│  │  • Search        │  │  • kms-upload    │  │  • Webhooks      │                   │
│  │  • Duplicates    │  │  • kms-search    │  │  • SDKs          │                   │
│  │  • Junk Cleanup  │  │                  │  │                  │                   │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘                   │
│           │                     │                     │                              │
└───────────┼─────────────────────┼─────────────────────┼──────────────────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY (Nginx)                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  • SSL/TLS Termination                                                              │
│  • Load Balancing (Round Robin / Least Connections)                                 │
│  • Rate Limiting (per API key)                                                      │
│  • Request Routing (/api/v1/* → kms-api, /search/* → search-api)                   │
│  • Health Check Endpoints                                                           │
│  • CORS Handling                                                                    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                  │
                ┌─────────────────┴─────────────────┐
                │                                   │
                ▼                                   ▼
┌───────────────────────────────────┐   ┌───────────────────────────────────┐
│           kms-api                 │   │          search-api               │
│          (NestJS)                 │   │            (Go)                   │
├───────────────────────────────────┤   ├───────────────────────────────────┤
│                                   │   │                                   │
│  RESPONSIBILITIES:                │   │  RESPONSIBILITIES:                │
│  ├─ User Authentication           │   │  ├─ Full-text Search (PostgreSQL)│
│  ├─ API Key Management            │   │  ├─ Semantic Search (Qdrant)     │
│  ├─ Source Management             │   │  ├─ Hybrid Search Ranking        │
│  ├─ File CRUD Operations          │   │  ├─ Filter Processing            │
│  ├─ Scan Job Orchestration        │   │  ├─ Faceted Search               │
│  ├─ Duplicate Management          │   │  └─ Result Caching               │
│  ├─ Junk File Management          │   │                                   │
│  └─ Webhook Dispatch              │   │  TECH STACK:                      │
│                                   │   │  ├─ Go 1.21+                      │
│  TECH STACK:                      │   │  ├─ Gin/Fiber Framework           │
│  ├─ NestJS 10.x                   │   │  ├─ pgx (PostgreSQL)              │
│  ├─ TypeORM                       │   │  ├─ qdrant-go-client              │
│  ├─ class-validator               │   │  └─ go-redis                      │
│  └─ @nestjs/swagger               │   │                                   │
│                                   │   │  PORTS:                           │
│  PORTS:                           │   │  └─ 8001 (HTTP)                   │
│  └─ 8000 (HTTP)                   │   │                                   │
└───────────────┬───────────────────┘   └───────────────┬───────────────────┘
                │                                       │
                │         ┌─────────────────────────────┘
                │         │
                ▼         ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           MESSAGE QUEUE (RabbitMQ)                                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  EXCHANGE: kms.direct (Direct Exchange)                                             │
│                                                                                      │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   scan.queue    │ │  embed.queue    │ │  dedup.queue    │ │  trans.queue    │   │
│  │                 │ │                 │ │                 │ │                 │   │
│  │ Routing: scan   │ │ Routing: embed  │ │ Routing: dedup  │ │ Routing: trans  │   │
│  │ Priority: 0-10  │ │ Priority: 0-10  │ │ Priority: 0-10  │ │ Priority: 0-10  │   │
│  │ DLX: kms.dlx    │ │ DLX: kms.dlx    │ │ DLX: kms.dlx    │ │ DLX: kms.dlx    │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘   │
│                                                                                      │
│  DEAD LETTER EXCHANGE: kms.dlx → failed.queue                                       │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
                │
    ┌───────────┼───────────┬───────────┬───────────┐
    │           │           │           │           │
    ▼           ▼           ▼           ▼           ▼
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│scan-worker │ │embed-worker│ │dedup-worker│ │junk-detect │ │ voice-app  │
│  (Python)  │ │  (Python)  │ │  (Python)  │ │  (Python)  │ │ (FastAPI)  │
├────────────┤ ├────────────┤ ├────────────┤ ├────────────┤ ├────────────┤
│            │ │            │ │            │ │            │ │            │
│ CONSUMES:  │ │ CONSUMES:  │ │ CONSUMES:  │ │ CONSUMES:  │ │ CONSUMES:  │
│ scan.queue │ │ embed.queue│ │ dedup.queue│ │ (internal) │ │ trans.queue│
│            │ │            │ │            │ │            │ │            │
│ PRODUCES:  │ │ PRODUCES:  │ │ PRODUCES:  │ │ PRODUCES:  │ │ PRODUCES:  │
│ embed.queue│ │ dedup.queue│ │ (graph)    │ │ (reports)  │ │ (webhooks) │
│            │ │            │ │            │ │            │ │            │
│ FEATURES:  │ │ FEATURES:  │ │ FEATURES:  │ │ FEATURES:  │ │ FEATURES:  │
│ • G.Drive  │ │ • PDF      │ │ • SHA-256  │ │ • Rules    │ │ • Whisper  │
│ • Local FS │ │ • Office   │ │ • Semantic │ │ • Patterns │ │ • Groq     │
│ • External │ │ • Images   │ │ • Versions │ │ • Cleanup  │ │ • Deepgram │
│ • Progress │ │ • Chunking │ │ • Grouping │ │ • ML (P2)  │ │ • Webhook  │
│            │ │ • Vectors  │ │ • Neo4j    │ │            │ │            │
└──────┬─────┘ └──────┬─────┘ └──────┬─────┘ └──────┬─────┘ └──────┬─────┘
       │              │              │              │              │
       └──────────────┴──────────────┴──────────────┴──────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                DATA LAYER                                            │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐   │
│  │      PostgreSQL       │  │        Qdrant         │  │        Neo4j          │   │
│  │       (Primary)       │  │      (Vectors)        │  │       (Graph)         │   │
│  ├───────────────────────┤  ├───────────────────────┤  ├───────────────────────┤   │
│  │                       │  │                       │  │                       │   │
│  │  STORES:              │  │  STORES:              │  │  STORES:              │   │
│  │  • User accounts      │  │  • File embeddings    │  │  • File hierarchy     │   │
│  │  • API keys           │  │  • Chunk embeddings   │  │  • Folder structure   │   │
│  │  • Sources            │  │  • Metadata payload   │  │  • Duplicate links    │   │
│  │  • Files metadata     │  │                       │  │  • User ownership     │   │
│  │  • Scan jobs          │  │  COLLECTIONS:         │  │                       │   │
│  │  • Duplicates         │  │  • kms_files_default  │  │  NODES:               │   │
│  │  • Transcriptions     │  │  • kms_files_cloud    │  │  • File, Folder       │   │
│  │                       │  │                       │  │  • User, Project      │   │
│  │  DOMAINS:             │  │  VECTOR SIZE:         │  │                       │   │
│  │  • auth_*             │  │  • 384 (default)      │  │  RELATIONSHIPS:       │   │
│  │  • kms_*              │  │  • 1536 (OpenAI)      │  │  • IN_FOLDER          │   │
│  │  • voice_*            │  │                       │  │  • DUPLICATE_OF       │   │
│  │                       │  │  INDEX: HNSW          │  │  • OWNS               │   │
│  │  PORT: 5432           │  │  PORT: 6333           │  │  PORT: 7687           │   │
│  └───────────────────────┘  └───────────────────────┘  └───────────────────────┘   │
│                                                                                      │
│  ┌───────────────────────┐  ┌───────────────────────┐                               │
│  │        MinIO          │  │        Redis          │                               │
│  │   (Object Storage)    │  │       (Cache)         │                               │
│  ├───────────────────────┤  ├───────────────────────┤                               │
│  │                       │  │                       │                               │
│  │  STORES:              │  │  STORES:              │                               │
│  │  • Uploaded files     │  │  • Search results     │                               │
│  │  • Processed audio    │  │  • API key sessions   │                               │
│  │  • Temp files         │  │  • Rate limit counters│                               │
│  │                       │  │  • Queue metrics      │                               │
│  │  BUCKETS:             │  │                       │                               │
│  │  • kms-uploads        │  │  TTL: 5 minutes       │                               │
│  │  • kms-processed      │  │  PORT: 6379           │                               │
│  │                       │  │                       │                               │
│  │  PORT: 9000           │  │                       │                               │
│  └───────────────────────┘  └───────────────────────┘                               │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### 1. Client Layer

| Component | Purpose | Technology |
|-----------|---------|------------|
| **Web UI** | Primary user interface | Next.js 14, TypeScript |
| **CLI Tool** | External drive scanning, automation | Python |
| **External Apps** | Third-party integrations | REST API |

### 2. API Layer

| Service | Port | Purpose | Scaling |
|---------|------|---------|---------|
| **kms-api** | 8000 | Main API gateway, CRUD operations | 2-4 instances |
| **search-api** | 8001 | Search operations, ranking | 2-4 instances |

### 3. Worker Layer

| Worker | Queue | Purpose | Scaling |
|--------|-------|---------|---------|
| **scan-worker** | scan.queue | File discovery from sources | 1-3 instances |
| **embedding-worker** | embed.queue | Content extraction, vectorization | 2-4 instances |
| **dedup-worker** | dedup.queue | Duplicate detection | 1-2 instances |
| **junk-detector** | (internal) | Junk file identification | 1 instance |
| **voice-app** | trans.queue | Audio/video transcription | 1-2 instances |

### 4. Data Layer

| Store | Port | Purpose | Data Type |
|-------|------|---------|-----------|
| **PostgreSQL** | 5432 | Structured data, metadata | Relational |
| **Qdrant** | 6333 | Vector embeddings | Vector |
| **Neo4j** | 7687 | Relationships, hierarchy | Graph |
| **MinIO** | 9000 | File storage | Object |
| **Redis** | 6379 | Caching, sessions | Key-Value |

---

## External Integrations

### Google Drive Integration

```
┌──────────────┐     OAuth 2.0      ┌──────────────┐
│   KMS API    │ ◄─────────────────►│ Google Cloud │
│              │                    │   Platform   │
└──────┬───────┘                    └──────────────┘
       │
       │ Encrypted tokens
       ▼
┌──────────────┐     Drive API      ┌──────────────┐
│ scan-worker  │ ◄─────────────────►│ Google Drive │
│              │   files.list()     │              │
└──────────────┘   files.get()      └──────────────┘
```

**OAuth Scopes Required:**
- `drive.readonly` - Read file content
- `drive.metadata.readonly` - Read file metadata
- `userinfo.email` - Get user email

### Voice-App Integration

```
┌──────────────┐                    ┌──────────────┐
│   KMS API    │ ──── POST /upload ──►│  voice-app  │
│              │ ◄─── Job ID ─────────│   (FastAPI) │
│              │                    │              │
│              │ ──── GET /jobs/:id ──►│              │
│              │ ◄─── Status ─────────│              │
│              │                    │              │
│              │ ◄─── Webhook ────────│              │
└──────────────┘    (completion)    └──────────────┘
```

---

## Network Architecture

### Internal Network

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Network: kms_network              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Services (internal DNS):                                   │
│  ├─ kms-api:8000                                           │
│  ├─ search-api:8001                                        │
│  ├─ scan-worker (no port)                                  │
│  ├─ embedding-worker (no port)                             │
│  ├─ dedup-worker (no port)                                 │
│  ├─ junk-detector (no port)                                │
│  ├─ postgres:5432                                          │
│  ├─ qdrant:6333                                            │
│  ├─ neo4j:7687                                             │
│  ├─ rabbitmq:5672 (AMQP), 15672 (Management)              │
│  ├─ redis:6379                                             │
│  └─ minio:9000                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Exposed Ports (Production)

| Port | Service | Access |
|------|---------|--------|
| 80 | Nginx (HTTP) | Public |
| 443 | Nginx (HTTPS) | Public |
| 15672 | RabbitMQ Management | Internal only |

---

## Request Flow Examples

### Search Request Flow

```
Client
  │
  │ POST /api/v1/search
  │ { "query": "machine learning", "filters": {...} }
  ▼
┌─────────┐
│  Nginx  │ → Rate limit check → Route to search-api
└────┬────┘
     ▼
┌──────────┐
│search-api│ → Validate request → Parse filters
└────┬─────┘
     │
     ├────────────────────────────────────┐
     │ (parallel)                         │
     ▼                                    ▼
┌──────────┐                        ┌─────────┐
│PostgreSQL│                        │  Qdrant │
│Full-text │                        │ Vector  │
│  Search  │                        │ Search  │
└────┬─────┘                        └────┬────┘
     │                                   │
     │ keyword_results                   │ semantic_results
     └────────────────┬──────────────────┘
                      │
                      ▼
               ┌──────────────┐
               │ Hybrid Merge │
               │  & Ranking   │
               └──────┬───────┘
                      │
                      ▼
               ┌──────────────┐
               │    Redis     │ → Cache results (5 min TTL)
               └──────┬───────┘
                      │
                      ▼
                   Response
```

### File Scan Flow

```
Client
  │
  │ POST /api/v1/scan-jobs { source_id: "..." }
  ▼
┌─────────┐
│ kms-api │ → Create scan job → Publish to scan.queue
└────┬────┘
     │
     ▼
┌──────────┐
│ RabbitMQ │ → Deliver to scan-worker
└────┬─────┘
     │
     ▼
┌────────────┐
│scan-worker │ → Fetch files from Google Drive
└────┬───────┘   → Insert into kms_files
     │           → Publish to embed.queue
     ▼
┌──────────────┐
│embed-worker  │ → Download file content
└────┬─────────┘   → Extract text
     │             → Generate embeddings
     │             → Store in Qdrant
     │             → Publish to dedup.queue
     ▼
┌────────────┐
│dedup-worker│ → Calculate hash
└────────────┘   → Find duplicates
                 → Create graph relationships
```

---

## Scaling Strategy

### Horizontal Scaling

| Component | Min | Max | Trigger |
|-----------|-----|-----|---------|
| kms-api | 2 | 8 | CPU > 70% |
| search-api | 2 | 8 | Latency > 400ms |
| scan-worker | 1 | 4 | Queue depth > 100 |
| embedding-worker | 2 | 8 | Queue depth > 500 |
| dedup-worker | 1 | 3 | Queue depth > 200 |

### Database Scaling (Future)

- **PostgreSQL**: Read replicas for search queries
- **Qdrant**: Cluster mode with sharding
- **Neo4j**: Causal cluster for read scaling

---

## Failure Handling

### Circuit Breaker Pattern

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   CLOSED    │───►│    OPEN     │───►│ HALF-OPEN   │
│             │    │             │    │             │
│ Requests OK │    │ Requests    │    │ Test with   │
│             │    │ Fail Fast   │    │ limited     │
│             │    │             │    │ requests    │
└─────────────┘    └─────────────┘    └──────┬──────┘
      ▲                                      │
      └──────────────────────────────────────┘
                  Success → CLOSED
```

### Dead Letter Queue

Failed messages after 3 retries → `failed.queue` → Manual review

### Job Recovery

- **Stale job detection**: Jobs in PROCESSING > 60 minutes → mark FAILED
- **Orphan job recovery**: Jobs in PENDING without queue message → re-queue

---

## Security Architecture

### Authentication Flow

```
Client
  │
  │ X-API-Key: kms_abc123...
  ▼
┌─────────┐
│ kms-api │
│         │
│  1. Hash API key (SHA-256)
│  2. Lookup in auth_api_keys
│  3. Check is_active, expires_at
│  4. Validate scopes
│  5. Inject user context
│         │
└────┬────┘
     ▼
  Authorized Request
```

### Data Encryption

| Data | At Rest | In Transit |
|------|---------|------------|
| OAuth tokens | AES-256-GCM | HTTPS |
| API keys | SHA-256 hash | HTTPS |
| File content | Not stored | HTTPS |
| Embeddings | Plain | Internal network |

---

## Monitoring Points

### Health Checks

| Service | Endpoint | Interval |
|---------|----------|----------|
| kms-api | GET /health | 10s |
| search-api | GET /health | 10s |
| PostgreSQL | pg_isready | 5s |
| Qdrant | GET /health | 10s |
| RabbitMQ | rabbitmq-diagnostics | 10s |

### Key Metrics

- **API**: Request rate, latency (p50, p95, p99), error rate
- **Workers**: Queue depth, processing time, success rate
- **Database**: Connection pool usage, query latency
- **Search**: Query latency, cache hit rate
