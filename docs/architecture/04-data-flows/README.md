# Data Flows Overview

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

This section documents the major data flows in the KMS system. Each flow represents an end-to-end process that spans multiple services, queues, and data stores.

---

## Flow Catalog

| Flow | Description | Services Involved |
|------|-------------|-------------------|
| [File Scanning](./file-scanning-flow.md) | Discover and index files from sources | kms-api, scan-worker |
| [Embedding Generation](./embedding-generation-flow.md) | Extract content and generate vectors | embedding-worker, Qdrant |
| [Search Query](./search-query-flow.md) | Hybrid keyword + semantic search | search-api, PostgreSQL, Qdrant |
| [Deduplication](./deduplication-flow.md) | Detect and group duplicate files | dedup-worker, Neo4j |
| [Transcription](./transcription-integration-flow.md) | Audio/video transcription | kms-api, voice-app |

---

## System Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USER REQUEST                                        │
└─────────────────────────────────┬───────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              WEB UI / API                                        │
│                                                                                  │
│  [Connect Source]  [Trigger Scan]  [Search Files]  [View Duplicates]            │
└────────┬──────────────┬──────────────┬──────────────────┬───────────────────────┘
         │              │              │                  │
         ▼              ▼              ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              KMS-API                                             │
│                                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Sources      │  │ Scan Jobs    │  │ Files        │  │ Duplicates   │         │
│  │ Controller   │  │ Controller   │  │ Controller   │  │ Controller   │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
└─────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┘
          │                 │                 │                 │
          │                 ▼                 │                 │
          │    ┌────────────────────┐         │                 │
          │    │    RabbitMQ        │         │                 │
          │    │ ┌──────────────┐   │         │                 │
          │    │ │ scan.queue   │───┼─────────┼─────────────────┤
          │    │ └──────────────┘   │         │                 │
          │    │ ┌──────────────┐   │         │                 │
          │    │ │ embed.queue  │───┼─────────┼─────────────────┤
          │    │ └──────────────┘   │         │                 │
          │    │ ┌──────────────┐   │         │                 │
          │    │ │ dedup.queue  │───┼─────────┼─────────────────┤
          │    │ └──────────────┘   │         │                 │
          │    └────────────────────┘         │                 │
          │              │                    │                 │
          │    ┌─────────┴─────────┐          │                 │
          │    ▼                   ▼          ▼                 ▼
          │ ┌─────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────┐
          │ │ scan-   │  │ embedding-   │  │ search-api  │  │ dedup-   │
          │ │ worker  │  │ worker       │  │             │  │ worker   │
          │ └────┬────┘  └──────┬───────┘  └──────┬──────┘  └────┬─────┘
          │      │              │                 │               │
          │      │              │                 │               │
          ▼      ▼              ▼                 ▼               ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATA STORES                                         │
│                                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  PostgreSQL  │  │   Qdrant     │  │   Neo4j      │  │    MinIO     │         │
│  │  (Metadata)  │  │  (Vectors)   │  │   (Graph)    │  │  (Files)     │         │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow Stages

### 1. Ingestion Stage

**Purpose**: Get files into the system

```
Source Connected → Scan Triggered → Files Discovered → Metadata Indexed
```

**Involved**:
- kms-api (trigger)
- scan-worker (discovery)
- PostgreSQL (storage)

### 2. Processing Stage

**Purpose**: Extract value from file content

```
File Indexed → Content Extracted → Text Chunked → Embeddings Generated → Vectors Stored
```

**Involved**:
- embedding-worker (processing)
- Qdrant (vector storage)

### 3. Analysis Stage

**Purpose**: Identify duplicates and junk

```
Embeddings Ready → Hash Comparison → Semantic Similarity → Version Detection → Groups Created
```

**Involved**:
- dedup-worker (detection)
- Neo4j (relationships)
- junk-detector (cleanup)

### 4. Query Stage

**Purpose**: Find relevant files

```
User Query → Query Analysis → Keyword Search → Semantic Search → Result Fusion → Ranked Results
```

**Involved**:
- search-api (orchestration)
- PostgreSQL (keyword)
- Qdrant (semantic)

---

## Message Flow Patterns

### 1. Request-Response (Synchronous)

```
Client ──HTTP──► API ──HTTP──► Response
```

Used for:
- User authentication
- File listing
- Search queries
- Stats retrieval

### 2. Fire-and-Forget (Asynchronous)

```
API ──publish──► Queue ──consume──► Worker ──update──► Database
```

Used for:
- File scanning
- Embedding generation
- Deduplication
- Transcription

### 3. Event Chain (Pipeline)

```
scan.queue → scan-worker → embed.queue → embedding-worker → dedup.queue → dedup-worker
```

Used for:
- New file processing pipeline
- Full reprocessing jobs

### 4. Webhook Notification

```
Worker ──complete──► Database ──webhook──► External System
```

Used for:
- Transcription completion
- Scan completion
- External integrations

---

## Error Handling Patterns

### Dead Letter Queue

```
Queue ──failed──► DLX ──route──► failed.queue
                                      │
                              ┌───────┴───────┐
                              ▼               ▼
                         Manual Review    Auto-Retry
```

### Retry with Backoff

```
Attempt 1 ──fail──► wait 1s ──► Attempt 2 ──fail──► wait 2s ──► Attempt 3 ──fail──► DLQ
```

### Circuit Breaker

```
Service A ──call──► Service B (failures > threshold)
                         │
                    ┌────┴────┐
                    ▼         ▼
              Circuit Open   Circuit Closed
              (fallback)     (normal)
```

---

## Data Consistency Patterns

### Eventual Consistency

```
Source                 │                    │
  │                    │                    │
  ▼                    ▼                    ▼
PostgreSQL ────────► Qdrant ────────────► Neo4j
(immediate)         (seconds)            (seconds)
```

### Saga Pattern (Transcription)

```
1. Create transcription link (KMS) ──success──►
2. Create job (Voice) ──success──►
3. Process transcription ──success──►
4. Update link status (KMS) ──complete──►

On failure at any step:
──► Compensating action (rollback link status)
```

---

## Performance Characteristics

| Flow | Latency Target | Throughput |
|------|----------------|------------|
| File Scan | < 1 min start | 1000 files/min |
| Embedding | < 5s/file | 500 files/min |
| Search | < 200ms | 100 req/s |
| Deduplication | < 2s/file | 1000 files/min |

---

## Monitoring Points

| Flow | Key Metrics |
|------|-------------|
| Scanning | Queue depth, files/minute, error rate |
| Embedding | Processing time, chunk count, vector writes/s |
| Search | Query latency (p50, p95, p99), cache hit rate |
| Deduplication | Groups created, savings calculated |

---

## Flow Documentation

| Document | Description |
|----------|-------------|
| [File Scanning Flow](./file-scanning-flow.md) | Source → Index pipeline |
| [Embedding Generation Flow](./embedding-generation-flow.md) | Content → Vector pipeline |
| [Search Query Flow](./search-query-flow.md) | Query processing |
| [Deduplication Flow](./deduplication-flow.md) | Duplicate detection |
| [Transcription Integration Flow](./transcription-integration-flow.md) | Audio → Text |

