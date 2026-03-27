# FOR-e2e-flows.md — End-to-End Data Flows

This guide documents the five key data flows in KMS: the exact URL at each hop,
the data shape entering and leaving each service, and known gaps or caveats.

---

## 1. Business Use Case

KMS is a multi-service system.  A single user action (e.g. "send a chat message")
crosses five or more service boundaries.  This guide is the authoritative map of those
hops so that developers can diagnose breakages and onboard quickly.

---

## 2. Flow Diagram (System Overview)

```mermaid
flowchart LR
    FE[Next.js Frontend] -->|REST + SSE| KA[kms-api :8000]
    KA -->|HTTP| SA[search-api :8001]
    KA -->|AMQP kms.scan| SW[scan-worker]
    SW -->|AMQP kms.embed| EW[embed-worker]
    SW -->|AMQP kms.dedup| DW[dedup-worker]
    EW -->|vectors| QD[Qdrant]
    EW -->|rows| PG[(PostgreSQL)]
    SA -->|FTS| PG
    SA -->|ANN| QD
    KA -->|sessions| RD[(Redis)]
```

---

## 3. Code Structure

| Service | Port | Entry Point |
|---------|------|-------------|
| `frontend` | 3000 | `frontend/app/[locale]/(dashboard)/` |
| `kms-api` | 8000 | `kms-api/src/main.ts` |
| `search-api` | 8001 | `search-api/src/main.ts` |
| `rag-service` | 8002 | `services/rag-service/app/main.py` |
| `scan-worker` | — (AMQP consumer) | `services/scan-worker/app/handlers/scan_handler.py` |
| `embed-worker` | — (AMQP consumer) | `services/embed-worker/app/handlers/embed_handler.py` |

---

## 4. Key Flows

---

### Flow 1 — Chat RAG (ACP + SSE)

**Path:** `useChat` → `acp.ts` → `AcpController` → `AcpService` → `search-api` → Qdrant + `AnthropicAdapter`

| Hop | Method + URL | Payload (→) | Response (←) |
|-----|-------------|-------------|--------------|
| 1. Browser → kms-api | `POST /api/v1/acp/v1/initialize` | `{ protocolVersion, clientInfo }` | `{ protocolVersion, agentCapabilities: { tools } }` |
| 2. Browser → kms-api | `POST /api/v1/acp/v1/sessions` + JWT | `{}` | `{ sessionId }` |
| 3. Browser → kms-api | `POST /api/v1/acp/v1/sessions/:id/prompt` + JWT + `Accept: text/event-stream` | `{ prompt: [{ type, text }] }` | SSE stream of `AcpEvent` objects |
| 4. kms-api (AcpToolRegistry) → search-api | `GET http://search-api:8001/search?q=...&mode=hybrid&limit=5` + `x-user-id` header | — | `{ results, total, took_ms }` |
| 5. kms-api (AnthropicAdapter) → Anthropic API | Anthropic Messages API, streaming | system + context + question | Token stream |

**SSE event types** (from `AcpEventEmitter`):
```
agent_message_chunk  { text }
tool_call_start      { tool, args }
tool_call_result     { tool, resultCount }
done                 {}
error                { message }
```

**Important caveat — sequence diagram divergence:**
Sequence diagrams `07-rag-chat.md` and `09-acp-gateway-prompt-flow.md` describe an
architecture where `kms-api` proxies prompts to `rag-service` (LangGraph), and
`rag-service` calls `search-api`.  The **current implementation** is different:
`AcpService` in `kms-api` calls `search-api` directly via `AcpToolRegistry.kmsSearch()`
and then calls `AnthropicAdapter.streamAnswer()` — there is no hop to `rag-service` in
the ACP prompt flow.  The sequence diagrams reflect the **planned future state** where
orchestration moves to `rag-service`.  Update the diagrams when that refactor occurs.

---

### Flow 2 — File Search

**Path:** `useSearch` → `search.ts` → `SearchController` → `SearchService` → `search-api`

| Hop | Method + URL | Payload (→) | Response (←) |
|-----|-------------|-------------|--------------|
| 1. Browser → kms-api | `GET /api/v1/search?q=...&type=hybrid&limit=20` + JWT | — (query params) | `{ results, total, searchType, took }` |
| 2. kms-api → search-api | `POST http://search-api:8001/search` + `x-user-id` header | `{ query, searchType, limit }` (JSON body) | `{ results, total, searchType, took }` |
| 3. search-api → PostgreSQL | BM25 full-text scan | — | Ranked rows |
| 4. search-api → Qdrant | Dense HNSW vector search (BGE-M3 1024-dim) | — | Scored chunk payloads |
| 5. search-api | RRF merge | — | `SearchResult[]` |

**Field mapping — kms-api → search-api:**

| kms-api query param | search-api JSON body field |
|---------------------|---------------------------|
| `q` | `query` |
| `type` | `searchType` |
| `limit` | `limit` |

**Important:** `search-api` exposes `POST /search` only (JSON body, no query params).
`kms-api/SearchService` must translate incoming query params into the JSON body before forwarding.
The `offset` param from the frontend is not forwarded; `search-api` uses cursor-based pagination internally.

**Frontend type (`SearchResult`):**
```typescript
{ id, fileId, filename, content, score, chunkIndex, metadata }
```

---

### Flow 3 — Source Connect → Scan

**Path:** `localSourcesApi.registerLocal()` → `SourcesController` → `SourcesService` → `kms.scan` queue → `ScanHandler` → `kms_files`

| Hop | Method + URL | Payload (→) | Response (←) |
|-----|-------------|-------------|--------------|
| 1. Browser → kms-api | `POST /api/v1/sources/local` + JWT | `{ path, displayName? }` | `{ id, userId, type, status, displayName, createdAt }` |
| 2. kms-api → PostgreSQL | `INSERT INTO kms_sources` | — | `{ source_id }` |
| 3. kms-api → RabbitMQ | `kms.scan` publish | `ScanJobMessage { scan_job_id, source_id, user_id, source_type, config }` | — (fire and forget) |
| 4. scan-worker consumes | `kms.scan` | `ScanJobMessage` | — |
| 5. scan-worker → PostgreSQL | Batch `UPSERT INTO kms_files` | 50-file batches | — |
| 6. scan-worker → RabbitMQ | `kms.embed` publish per file | `FileDiscoveredMessage` | — |
| 7. scan-worker → RabbitMQ | `kms.dedup` publish per file (if checksum present) | `DedupCheckMessage` | — |

**Status polling:** `useScanHistory(sourceId, enabled)` polls
`GET /api/v1/sources/:sourceId/scan-history` every 5 s while `enabled=true`.

---

### Flow 4 — File Embedding Pipeline

**Path:** `kms.embed` queue → `EmbedHandler` → extract → chunk → BGE-M3 → Qdrant + `kms_files`/`kms_chunks`

| Step | Action | Output |
|------|--------|--------|
| 1 | Parse `FileDiscoveredMessage` from `kms.embed` queue | Typed message |
| 2 | Extractor registry looks up extractor by MIME type | Raw text string |
| 3 | `chunk_text()` splits text into overlapping chunks | `TextChunk[]` |
| 4 | `EmbeddingService.encode_batch()` calls BGE-M3 (1024-dim) | `float[][]` |
| 5 | `QdrantService.upsert_chunks()` upserts `ChunkPoint[]` to Qdrant `kms_chunks` collection | — |
| 6 | `asyncpg` upserts `kms_files` (`embed_status=COMPLETED`) + inserts `kms_chunks` rows | — |
| 7 | AMQP `ack()` | — |

**Qdrant payload schema** (must match what `search-api` expects):
```json
{
  "user_id": "uuid",
  "source_id": "uuid",
  "file_id": "uuid",
  "filename": "string",
  "mime_type": "string",
  "content": "string (chunk text)",
  "chunk_index": 0
}
```

**Feature flag:** `EMBEDDING_ENABLED=true` (env var in embed-worker) gates steps 4–5.
If false, text is extracted and persisted but no vectors are stored.

---

### Flow 5 — Collections CRUD

**Path:** `useCollections` / `useCreateCollection` → `collectionsApi` → `CollectionsController` → `CollectionsService` → PostgreSQL `kms_collections`

| Hop | Method + URL | Payload (→) | Response (←) |
|-----|-------------|-------------|--------------|
| List | `GET /api/v1/collections` + JWT | — | `CollectionResponseDto[]` |
| Create | `POST /api/v1/collections` + JWT | `{ name, description? }` | `CollectionResponseDto` |
| Get one | `GET /api/v1/collections/:id` + JWT | — | `CollectionResponseDto` |
| Update | `PATCH /api/v1/collections/:id` + JWT | `{ name?, description? }` | `CollectionResponseDto` |
| Delete | `DELETE /api/v1/collections/:id` + JWT | — | `204 No Content` |
| Add files (bulk) | `POST /api/v1/collections/:id/files` + JWT | `{ fileIds: string[] }` | `204 No Content` |
| Remove file (single) | `DELETE /api/v1/collections/:id/files/:fileId` + JWT | — | `204 No Content` |

**Fixed — `removeFiles` (bulk) API aligned to backend:**
`collectionsApi` now exposes `removeFile(collectionId, fileId)` (single-file only),
matching the only endpoint the backend exposes: `DELETE /collections/:id/files/:fileId`.
A bulk `removeFiles` endpoint does not exist on the backend. To remove multiple files
iterate `removeFile` per fileId, or add `DELETE /collections/:id/files` with a
`{ fileIds }` body to `CollectionsController` (backlog item).

---

## 5. Error Cases

| Flow | Failure Point | Error | Frontend Handling |
|------|--------------|-------|-------------------|
| Chat RAG | `search-api` unreachable | `AppError KBEXT0001` → SSE `{ type: error, message }` | Error shown in assistant bubble |
| Chat RAG | Anthropic API unreachable | SSE `{ type: error, message }` | Error shown in assistant bubble; session reset |
| File Search | `search-api` 502 | `ApiError(502)` | `useSearch` error state; component shows error banner |
| Source scan | scan-worker crash | AMQP nack + requeue | Source stays `SCANNING`; `useScanHistory` shows no completion |
| Embed pipeline | BGE-M3 OOM | `EmbeddingError(retryable=True)` | nack + requeue; `kms_files.embed_status = FAILED` after max retries |
| Collections | Default collection delete | `409 Conflict` | `ApiError(409)`; component shows "Cannot delete default collection" |

---

## 6. Configuration

| Variable | Service | Description | Default |
|----------|---------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | frontend | kms-api base URL | `http://localhost:8000` |
| `NEXT_PUBLIC_KMS_API_URL` | frontend | kms-api base URL + `/api/v1` (for ACP client) | `http://localhost:8000/api/v1` |
| `SEARCH_API_URL` | kms-api | search-api base URL for `kms_search` tool | `http://localhost:8001` |
| `EMBEDDING_ENABLED` | embed-worker | Enable BGE-M3 encoding and Qdrant upsert | `true` |
| `RABBITMQ_URL` | all workers | AMQP connection string | `amqp://guest:guest@localhost:5672` |
| `QDRANT_URL` | embed-worker, search-api | Qdrant HTTP URL | `http://localhost:6333` |
