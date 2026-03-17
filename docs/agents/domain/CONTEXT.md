# Domain Group — CONTEXT

## Agents in This Group

| Skill | File | Responsibility |
|-------|------|----------------|
| `/kb-search-specialist` | `domain/search-specialist.md` | Hybrid search, Qdrant integration, RRF algorithm, BM25, search cache strategy |
| `/kb-voice-specialist` | `domain/voice-specialist.md` | Transcription providers (Whisper/Groq/Deepgram), job lifecycle, worker patterns |
| `/kb-embedding-specialist` | `domain/embedding-specialist.md` | Content extraction, text chunking, sentence-transformers, Qdrant vector indexing |

---

## When to Use `/kb-search-specialist`

Use the search specialist when:

- Implementing or modifying **hybrid search** (RRF fusion logic, weight tuning)
- Configuring **Qdrant collections** (HNSW parameters, payload schema, filtering)
- Tuning **BM25/FTS** in PostgreSQL (tsvector, GIN index, `ts_headline`)
- Designing the **Redis search cache** strategy (key schema, TTL, invalidation)
- Debugging **search relevance** issues (poor ranking, missing results, score anomalies)
- Adding **search filters** (by file type, source, date range, tags)
- Implementing **search suggestions** or autocomplete
- Writing or reviewing **ADRs for search algorithm choices**

The search specialist owns: RRF algorithm, Qdrant client code, PostgreSQL FTS queries, Redis cache for search.

---

## When to Use `/kb-voice-specialist`

Use the voice specialist when:

- Integrating a **new transcription provider** (following the base class pattern)
- Debugging the **job lifecycle** (PENDING → QUEUED → PROCESSING → COMPLETED/FAILED)
- Implementing **webhook delivery** for transcription completion events
- Handling **stale job recovery** (PROCESSING → QUEUED on worker restart)
- Adding **language detection** or provider routing logic
- Configuring **job timeout** policies and monitoring
- Working with **audio processing** (FFmpeg, WAV conversion, sample rate)
- Understanding the **RabbitMQ queue structure** for voice jobs (`trans.queue`, `priority.queue`)

The voice specialist owns: `backend/app/workers/consumer.py`, `backend/app/services/transcription/`, job status transitions.

---

## When to Use `/kb-embedding-specialist`

Use the embedding specialist when:

- Implementing or modifying **content extraction** pipelines (PDF, DOCX, TXT parsing)
- Designing **text chunking strategies** (fixed-size, sentence-boundary, paragraph-boundary)
- Configuring **sentence-transformers** inference (batch size, device, model selection)
- Indexing vectors into **Qdrant** (collection setup, upsert strategy, payload design)
- Handling **multi-language documents** in the chunking or embedding pipeline
- Optimizing **embedding throughput** (batching, GPU vs CPU, model caching)
- Debugging **poor vector quality** (chunking too large/small, language mismatch)
- Designing **re-indexing strategies** for corpus updates

The embedding specialist owns: `backend/app/workers/embedding/`, text chunkers, sentence-transformer wrappers, Qdrant upsert logic.

---

## Domain Group Relationships

These three agents are closely related and frequently used together:

```
Document ingested
    ↓
/kb-embedding-specialist  ← handles extraction + chunking + vectorization
    ↓
Vectors stored in Qdrant
    ↓
/kb-search-specialist     ← handles retrieval + RRF fusion + cache
    ↓
Search results returned

Audio file uploaded
    ↓
/kb-voice-specialist      ← handles transcription job lifecycle
    ↓
Transcript stored
    ↓
/kb-embedding-specialist  ← optionally embed transcript for search
```

---

## Shared Resources

- `docs/agents/shared/variables.md` — Queue names, job statuses, embedding model spec, Qdrant port
- `docs/agents/shared/patterns.md` — RRF formula, cache strategy, worker batch sizes, retry logic
- `docs/agents/samples/sample-adr.md` — ADR-001: Hybrid Search RRF decision
