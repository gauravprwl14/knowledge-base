# Knowledge Base System — Master Architecture v2.0

**Version**: 2.0
**Date**: 2026-03-17
**Status**: Active — Authoritative Reference
**Supersedes**: KMS_SYSTEM_ARCHITECTURE.md (v1.0)

---

## Decision Log (Backtracking Trail)

All architectural decisions are recorded with rationale so future contributors can understand *why*, not just *what*.

| # | Decision | Rationale | Date | ADR |
|---|----------|-----------|------|-----|
| 1 | NestJS for API gateway | Type-safe, modular, decorator-driven; best-in-class for enterprise Node.js | 2026-01-07 | ADR-001 |
| 2 | Python for workers | ML ecosystem (transformers, sentence-transformers, LangChain) unmatched | 2026-01-07 | ADR-002 |
| 3 | Qdrant over pgvector | Dedicated vector DB with HNSW indexing, filtering, Rust performance | 2026-01-07 | ADR-003 |
| 4 | Neo4j for graph | Cypher query language, APOC plugins, native graph storage | 2026-01-07 | ADR-004 |
| 5 | RabbitMQ for queues | Proven reliability, dead letter queues, priority queues, prefetch control | 2026-01-07 | ADR-005 |
| 6 | Graph traversal over pure RAG | GitNexus-inspired precomputed relationship graph; enables path-finding, not just similarity | 2026-03-17 | ADR-006 |
| 7 | ACP for agent orchestration | Open standard (agentcommunicationprotocol.dev); framework-agnostic; REST+async | 2026-03-17 | ADR-007 |
| 8 | Local-first LLM with cloud fallback | Privacy, cost control; Ollama (local) → OpenRouter (fallback) | 2026-03-17 | ADR-008 |
| 9 | TDD-first development | Design quality, regression safety, parallel team confidence | 2026-03-17 | ADR-009 |
| 10 | Obsidian as plugin (not connector) | Native vault experience; bidirectional sync; plugin API is stable TypeScript | 2026-03-17 | ADR-010 |
| 11 | Design token philosophy (3-tier) | Primitive → Semantic → Component; consistent theming; Tailwind v4 @theme | 2026-03-17 | ADR-011 |
| 12 | OpenTelemetry as core telemetry | Vendor-neutral; auto-instrumentation; all services instrumented from day one | 2026-03-17 | ADR-012 |

---

## System Overview

The Knowledge Base System is a distributed, event-driven, multi-agent platform for:
- Ingesting knowledge from multiple sources (Google Drive, Obsidian, local FS, external drives)
- Building a traversable knowledge graph (not just a search index)
- Enabling RAG-based Q&A with citation tracking
- Detecting and managing duplicates across all sources
- Exposing everything through a unified, beautiful UI and agent API

---

## Architecture Layers

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                    CLIENT LAYER                                           │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                           │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐               │
│  │      Web UI         │  │   Obsidian Plugin   │  │    CLI Tool         │               │
│  │  (Next.js 15)       │  │   (TypeScript)      │  │   (Python)          │               │
│  │                     │  │                     │  │                     │               │
│  │ • Dashboard         │  │ • Vault watcher     │  │ • kms-scan          │               │
│  │ • Knowledge Graph   │  │ • Bidirectional sync│  │ • kms-upload        │               │
│  │ • RAG Chat          │  │ • Backlink resolver │  │ • kms-search        │               │
│  │ • Notes Capture     │  │ • Tag push/pull     │  │ • kms-status        │               │
│  │ • Duplicate Manager │  │ • Suggests related  │  │                     │               │
│  │ • Source Manager    │  │                     │  │                     │               │
│  └──────────┬──────────┘  └──────────┬──────────┘  └──────────┬──────────┘               │
│             │                        │                        │                           │
└─────────────┼────────────────────────┼────────────────────────┼───────────────────────────┘
              │                        │                        │
              └────────────────────────┼────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          API GATEWAY — Nginx / Traefik                                    │
│  • SSL/TLS termination          • Rate limiting (per API key)                             │
│  • Load balancing               • Request routing                                         │
│  • CORS                         • Health check endpoints                                  │
│  • Request ID injection         • Access logging → OTel                                   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                │                               │
    ┌───────────┘                               └───────────┐
    ▼                                                       ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│           kms-api            │        │         search-api            │
│          (NestJS 10)         │        │          (NestJS 10)          │
│                              │        │                               │
│  RESPONSIBILITIES:           │        │  RESPONSIBILITIES:            │
│  • Auth (JWT + API Key)      │        │  • Full-text (PostgreSQL FTS)│
│  • Source management         │        │  • Semantic (Qdrant)         │
│  • Files/Notes CRUD          │        │  • Graph traversal queries   │
│  • Scan job orchestration    │◄──────►│  • Hybrid ranking (RRF)      │
│  • Duplicate management      │        │  • Faceted filters           │
│  • Agent orchestration       │        │  • Result caching (Redis)    │
│  • Webhook dispatch          │        │                               │
│  • ACP server endpoint       │        │  PORT: 8001                   │
│                              │        │                               │
│  PORT: 8000                  │        └──────────────────────────────┘
└──────────────────────────────┘
              │
              │ Calls internally (not via client)
              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                              AGENT ORCHESTRATION LAYER                                    │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                           │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                    Orchestrator Agent (kms-api module)                              │  │
│  │                                                                                     │  │
│  │  Protocol: ACP (agentcommunicationprotocol.dev) — REST-based, async-first          │  │
│  │                                                                                     │  │
│  │  Routes to specialist agents via ACP messages:                                     │  │
│  │                                                                                     │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │  │
│  │  │ SearchAgent  │ │  GraphAgent  │ │   RAGAgent   │ │  SyncAgent   │              │  │
│  │  │              │ │              │ │              │ │              │              │  │
│  │  │ • Hybrid     │ │ • Traversal  │ │ • LLM Q&A   │ │ • Drive sync │              │  │
│  │  │   search     │ │ • Path find  │ │ • Citations  │ │ • Obsidian   │              │  │
│  │  │ • Ranking    │ │ • Community  │ │ • Streaming  │ │ • Local FS   │              │  │
│  │  │ • Filtering  │ │   detection  │ │ • Memory     │ │ • Status     │              │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘              │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                           │
└──────────────────────────────────────────────────────────────────────────────────────────┘
              │
              │ publishes messages to RabbitMQ
              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          MESSAGE QUEUE — RabbitMQ 3.13+                                   │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│  Exchange: kms.direct (direct) + kms.topic (fan-out events)                               │
│                                                                                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │  scan.queue  │ │ embed.queue  │ │ dedup.queue  │ │ trans.queue  │ │ graph.queue  │   │
│  │  Priority 10 │ │  Priority 8  │ │  Priority 6  │ │  Priority 7  │ │  Priority 5  │   │
│  │  DLQ: 3 ret  │ │  DLQ: 3 ret  │ │  DLQ: 3 ret  │ │  DLQ: 3 ret  │ │  DLQ: 3 ret  │   │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │
│                                                                                           │
│  Dead Letter Exchange: kms.dlx → failed.queue → manual review + alerting                 │
│                                                                                           │
└──────────────────────────────────────────────────────────────────────────────────────────┘
              │
   ┌──────────┼────────────────────────────────────┐
   │          │          │          │          │    │
   ▼          ▼          ▼          ▼          ▼    ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│scan-     │ │embed-    │ │dedup-    │ │junk-     │ │voice-app │ │obsidian-sync │
│worker    │ │worker    │ │worker    │ │detector  │ │(FastAPI) │ │worker        │
│(Python)  │ │(Python)  │ │(Python)  │ │(Python)  │ │          │ │(Python)      │
│          │ │          │ │          │ │          │ │          │ │              │
│Connectors│ │PDF/DOCX  │ │SHA-256   │ │Rule-based│ │Whisper   │ │Vault watcher │
│GoogleDrv │ │Images    │ │Semantic  │ │ML classify│ │Groq      │ │MD parser     │
│Local FS  │ │Audio     │ │Version   │ │pHash img │ │Deepgram  │ │Frontmatter   │
│Ext Drive │ │Chunking  │ │pHash     │ │          │ │Webhooks  │ │Backlinks     │
│          │ │Vectors   │ │Neo4j     │ │          │ │          │ │Tags          │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘

                              ┌──────────────────────────────────┐
                              │         rag-service              │
                              │       (Python / FastAPI)         │
                              │                                  │
                              │  • LangChain / LlamaIndex        │
                              │  • Query decomposition           │
                              │  • Graph-aware retrieval         │
                              │  • Leiden community context      │
                              │  • LLM generation                │
                              │  • Citation tracking             │
                              │  • Conversation memory (Redis)   │
                              │  • Streaming SSE responses       │
                              │                                  │
                              │  PORT: 8002                      │
                              └──────────────────────────────────┘
```

---

## Data Layer

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                       DATA LAYER                                         │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                           │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐           │
│  │     PostgreSQL 17    │  │    Qdrant 1.9+        │  │     Neo4j 5.x        │           │
│  │     (Primary)        │  │    (Vectors)          │  │     (Graph)          │           │
│  ├──────────────────────┤  ├──────────────────────┤  ├──────────────────────┤           │
│  │ Schemas:             │  │ Collections:          │  │ Node Labels:         │           │
│  │ • auth.*             │  │ • file_embeddings     │  │ • File               │           │
│  │ • kms.*              │  │ • chunk_embeddings    │  │ • Folder             │           │
│  │ • voice.*            │  │ • note_embeddings     │  │ • Note               │           │
│  │ • graph_cache.*      │  │ • query_cache         │  │ • Tag                │           │
│  │                      │  │                       │  │ • Entity             │           │
│  │ Indexes:             │  │ Vector Dims:          │  │ • Concept            │           │
│  │ • GIN (full-text)    │  │ • 384 (local model)   │  │ • Person             │           │
│  │ • HNSW (future)      │  │ • 1536 (OpenAI)       │  │ • Project            │           │
│  │ • Composite          │  │ • 768 (Nomic)         │  │ • Source             │           │
│  │ • Partial            │  │                       │  │                      │           │
│  │                      │  │ Index: HNSW           │  │ Relationships:       │           │
│  │ PORT: 5432           │  │ Distance: Cosine      │  │ • IN_FOLDER          │           │
│  └──────────────────────┘  │ PORT: 6333            │  │ • LINKS_TO           │           │
│                             └──────────────────────┘  │ • TAGGED_BY          │           │
│                                                        │ • SIMILAR_TO         │           │
│  ┌──────────────────────┐  ┌──────────────────────┐  │ • DUPLICATE_OF       │           │
│  │     MinIO (latest)   │  │    Redis 7.4+         │  │ • REFERENCES         │           │
│  │   (Object Storage)   │  │    (Cache)            │  │ • AUTHORED_BY        │           │
│  ├──────────────────────┤  ├──────────────────────┤  │ • MEMBER_OF_CLUSTER  │           │
│  │ Buckets:             │  │ Key namespaces:       │  │ • TRAVERSAL_PATH     │           │
│  │ • kms-originals      │  │ • search:*  (5m TTL) │  │                      │           │
│  │ • kms-processed      │  │ • session:* (24h)    │  │ PORT: 7687           │           │
│  │ • kms-thumbs         │  │ • ratelimit:*        │  │ UI: 7474             │           │
│  │ • kms-exports        │  │ • agent:context:*    │  └──────────────────────┘           │
│  │                      │  │ • graph:cache:*      │                                     │
│  │ PORT: 9000           │  │                      │                                     │
│  │ UI:   9001           │  │ PORT: 6379           │                                     │
│  └──────────────────────┘  └──────────────────────┘                                     │
│                                                                                           │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Graph Traversal Architecture (GitNexus-Inspired)

Unlike pure vector search (RAG), this system builds a **precomputed, traversable knowledge graph** that enables:
- Path-finding between concepts
- Community/cluster detection
- Blast radius (what else is affected/related)
- Navigation without re-reading all documents

### Graph Indexing Pipeline (6 Phases)

```
Phase 1: Structure Mapping
  └─ Build folder/file hierarchy in Neo4j
  └─ Detect source types, MIME types, file sizes

Phase 2: Content Extraction
  └─ PDF → text, DOCX → text, Images → OCR text
  └─ Obsidian MD → frontmatter + body + backlinks
  └─ Audio/Video → transcription text

Phase 3: Entity & Concept Extraction
  └─ Named Entity Recognition (NER) via spaCy / LLM
  └─ Key concept extraction
  └─ Tag and label normalization
  └─ Backlink resolution (Obsidian [[links]])

Phase 4: Community Detection
  └─ Build graph edges from shared tags, references, concepts
  └─ Run Leiden algorithm for cluster detection
  └─ Generate cluster labels (via LLM summarization)
  └─ Assign cohesion scores per cluster

Phase 5: Embedding Generation
  └─ Chunk text (recursive character splitting)
  └─ Generate embeddings (local: nomic-embed-text; cloud: text-embedding-3-small)
  └─ Store in Qdrant with graph node ID as payload

Phase 6: Traversal Index Building
  └─ Precompute SIMILAR_TO edges (cosine similarity > 0.85)
  └─ Cache common traversal paths in Redis
  └─ Build BM25 full-text index in PostgreSQL
```

### Traversal Query Patterns

```cypher
// Find path between two concepts
MATCH path = shortestPath(
  (a:Concept {name: 'Machine Learning'})-[*..6]-(b:Concept {name: 'Neural Networks'})
)
RETURN path

// Find community members for a topic cluster
MATCH (c:Cluster {label: 'AI Research'})<-[:MEMBER_OF_CLUSTER]-(n)
RETURN n ORDER BY n.relevance_score DESC LIMIT 20

// Blast radius - what connects to a document
MATCH (f:File {id: $file_id})-[r]-(connected)
WHERE type(r) IN ['LINKS_TO', 'SIMILAR_TO', 'REFERENCES', 'TAGGED_BY']
RETURN connected, type(r), r.confidence
ORDER BY r.confidence DESC

// Navigate from a note through its backlinks
MATCH (n:Note {id: $note_id})-[:LINKS_TO]->(related)
OPTIONAL MATCH (related)-[:TAGGED_BY]->(tag)
RETURN related, collect(tag) as tags
```

---

## LLM & Embedding Strategy

### Architecture Decision: Local-First, Cloud-Fallback

```
┌─────────────────────────────────────────────────────────────────┐
│                    LLM Provider Strategy                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  EMBEDDINGS:                                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Primary: nomic-embed-text (via Ollama, local, free)     │   │
│  │  • Dims: 768, context: 8192 tokens                       │   │
│  │  • Fast: ~10ms per chunk on CPU                          │   │
│  │                                                           │   │
│  │  Fallback: OpenAI text-embedding-3-small (via OpenRouter)│   │
│  │  • Dims: 1536, $0.02/1M tokens                          │   │
│  │  • Config: EMBEDDING_PROVIDER=openai                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  RAG / GENERATION:                                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Primary: llama3.2 or mistral (via Ollama, local)        │   │
│  │  • Free, private, no API key needed                      │   │
│  │                                                           │   │
│  │  Premium: Claude claude-sonnet-4-6 / GPT-4o              │   │
│  │  • Via OpenRouter (single API key, multiple providers)   │   │
│  │  • Config: LLM_PROVIDER=openrouter                       │   │
│  │  • OPENROUTER_API_KEY=sk-or-...                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ENTITY EXTRACTION / CLASSIFICATION:                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  spaCy en_core_web_sm (NER, local, no API)               │   │
│  │  Fallback: LLM extraction for complex entities           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Required secrets (user to provide):**
```bash
# Optional — system works fully offline without these
OPENROUTER_API_KEY=sk-or-v1-...   # For premium LLM (claude/gpt-4o)
OPENAI_API_KEY=sk-...             # Direct OpenAI if preferred

# Always required
EMBEDDING_PROVIDER=local          # or: openai, openrouter
LLM_PROVIDER=ollama               # or: openrouter, openai
OLLAMA_HOST=http://ollama:11434   # Docker service name
```

---

## Agent Orchestration (ACP)

Implements the **Agent Communication Protocol** (REST-based, async-first).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    ACP Agent Orchestration                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Client Request → kms-api /api/v1/agents/run                                 │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                   OrchestratorAgent                                  │     │
│  │                                                                      │     │
│  │  Intent classification → Route to specialist agent(s)               │     │
│  │                                                                      │     │
│  │  Patterns used:                                                      │     │
│  │  • Routing: classify query → SearchAgent | GraphAgent | RAGAgent    │     │
│  │  • Parallelization: run search + graph traversal concurrently       │     │
│  │  • Orchestrator-Workers: decompose complex Q into sub-queries       │     │
│  │  • Evaluator-Optimizer: RAGAgent generates + evaluates answer       │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│              │              │              │                                  │
│              ▼              ▼              ▼                                  │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐                       │
│  │  SearchAgent  │ │  GraphAgent   │ │   RAGAgent    │                       │
│  │               │ │               │ │               │                       │
│  │ ACP endpoint: │ │ ACP endpoint: │ │ ACP endpoint: │                       │
│  │ /agents/      │ │ /agents/      │ │ /agents/      │                       │
│  │ search/run    │ │ graph/run     │ │ rag/run       │                       │
│  │               │ │               │ │               │                       │
│  │ Tools:        │ │ Tools:        │ │ Tools:        │                       │
│  │ • hybridSearch│ │ • traverse    │ │ • retrieveCtx │                       │
│  │ • filterFiles │ │ • findPath    │ │ • generateAns │                       │
│  │ • rankResults │ │ • detectComm  │ │ • streamResp  │                       │
│  │               │ │ • blastRadius │ │ • trackCites  │                       │
│  └───────────────┘ └───────────────┘ └───────────────┘                       │
│                                                                               │
│  ACP Message Format:                                                          │
│  POST /agents/{name}/runs                                                    │
│  { "input": [{"role": "user", "content": {...}}], "stream": true }          │
│                                                                               │
│  MCP Tool Exposure (for IDE integration via Zed ACP):                        │
│  • search(query, filters) → SearchResult[]                                   │
│  • traverse(node_id, depth) → GraphPath                                      │
│  • ask(question) → RAGResponse with citations                                │
│  • sync(source_id) → SyncStatus                                              │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Source Connector Plugin Architecture

All connectors implement a common interface. New sources = new connector class.

```python
# base_connector.py
class BaseConnector(ABC):
    """All source connectors implement this interface."""

    @abstractmethod
    async def list_files(
        self,
        folder_id: str | None = None,
        modified_after: datetime | None = None
    ) -> AsyncGenerator[FileMetadata, None]: ...

    @abstractmethod
    async def get_content(self, file_id: str) -> bytes: ...

    @abstractmethod
    async def watch_changes(self) -> AsyncGenerator[ChangeEvent, None]: ...

    @abstractmethod
    async def health_check(self) -> ConnectorHealth: ...
```

**Registered connectors:**
| Connector | Source | Status |
|-----------|--------|--------|
| `GoogleDriveConnector` | Google Drive (all file types) | M2 |
| `ObsidianConnector` | Obsidian vault (mounted volume) | M5 |
| `LocalFSConnector` | Local filesystem paths | M3 |
| `ExternalDriveConnector` | USB/NFS drives via CLI | M4 |
| `NotionConnector` | Notion pages + databases | Future |
| `GitHubConnector` | GitHub repos (README, docs, issues) | Future |
| `SlackConnector` | Slack channel archives | Future |

---

## Microservices Catalog (All Services)

| # | Service | Lang | Port | Role | Priority |
|---|---------|------|------|------|----------|
| 1 | `kms-api` | NestJS | 8000 | Auth, orchestration, CRUD | M1 |
| 2 | `search-api` | NestJS | 8001 | Hybrid search, graph queries | M3 |
| 3 | `rag-service` | Python | 8002 | LLM Q&A, citations, streaming | M6 |
| 4 | `voice-app` | Python | 8003 | Audio/video transcription | Existing |
| 5 | `scan-worker` | Python | — | File discovery from sources | M2 |
| 6 | `embed-worker` | Python | — | Content extraction + vectorize | M3 |
| 7 | `dedup-worker` | Python | — | SHA-256 + semantic dedup | M5 |
| 8 | `junk-detector` | Python | — | Junk file classification | M5 |
| 9 | `obsidian-sync` | Python | — | Obsidian vault watcher | M5 |
| 10 | `graph-worker` | Python | — | Graph indexing, Leiden clustering | M4 |
| 11 | `ollama` | Ollama | 11434 | Local LLM + embedding service | M3 |
| 12 | `web-ui` | Next.js | 3000 | Frontend | M1 |
| 13 | `nginx` | Nginx | 80/443 | API gateway | M1 |

**Infrastructure:**
| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | 5432 | Primary database |
| `qdrant` | 6333 | Vector store |
| `neo4j` | 7474/7687 | Knowledge graph |
| `redis` | 6379 | Cache + sessions |
| `rabbitmq` | 5672/15672 | Message queue |
| `minio` | 9000/9001 | Object storage |
| `otel-collector` | 4317/4318 | Telemetry ingestion |
| `jaeger` | 16686 | Distributed tracing |
| `prometheus` | 9090 | Metrics |
| `grafana` | 3001 | Dashboards |

---

## Frontend Architecture (Design Token System)

Follows the **three-tier token architecture** (Primitive → Semantic → Component):

```
packages/
├── design-tokens/           # @kb/tokens
│   ├── src/
│   │   ├── primitive/       # Raw values (never used directly in components)
│   │   │   ├── colors.ts    # color-blue-500, color-gray-100...
│   │   │   ├── spacing.ts   # spacing-1 = 4px, spacing-2 = 8px...
│   │   │   ├── typography.ts
│   │   │   └── radius.ts
│   │   ├── semantic/        # Role-based aliases
│   │   │   ├── colors.ts    # color-primary → color-blue-500
│   │   │   ├── feedback.ts  # color-error, color-success, color-warning
│   │   │   └── layout.ts    # spacing-page-gutter, spacing-section...
│   │   └── component/       # Component-specific tokens
│   │       ├── button.ts    # button-bg, button-text, button-radius
│   │       ├── card.ts
│   │       └── input.ts
│   └── generated/
│       ├── css/globals.css  # CSS custom properties (generated)
│       └── js/tokens.ts     # TypeScript constants (generated)
│
├── ui/                      # @kb/ui — component library
│   ├── src/
│   │   ├── components/
│   │   │   ├── Button/
│   │   │   ├── Card/
│   │   │   ├── Graph/           # Knowledge graph visualizer
│   │   │   ├── ChatPanel/       # RAG chat
│   │   │   ├── FileCard/        # File display
│   │   │   └── ...
│   │   └── index.ts
│
└── web-ui/                  # Next.js 15 app
    ├── app/
    │   ├── (dashboard)/
    │   │   ├── knowledge-graph/page.tsx
    │   │   ├── search/page.tsx
    │   │   ├── chat/page.tsx
    │   │   ├── notes/page.tsx
    │   │   ├── duplicates/page.tsx
    │   │   └── sources/page.tsx
    │   └── api/             # BFF — Next.js API routes proxy to kms-api
    │       ├── search/route.ts
    │       ├── agents/route.ts
    │       └── ...
    └── tailwind.config.ts   # Tailwind v4 @theme with token refs
```

**CSS Token Generation (Tailwind v4 `@theme`):**
```css
/* globals.css — generated from design-tokens */
@theme {
  --color-primary: oklch(0.62 0.19 250);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-secondary: oklch(0.55 0.22 293);
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.14 0.02 240);
  --color-muted: oklch(0.95 0.01 240);
  --color-error: oklch(0.55 0.21 25);
  --color-success: oklch(0.55 0.17 145);

  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;

  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 1rem;
}

[data-theme="dark"] {
  --color-background: oklch(0.14 0.02 240);
  --color-foreground: oklch(0.98 0 0);
}
```

---

## Observability (Core, Not Optional)

Every service is instrumented from day 1. No service goes to production without traces, metrics, and logs.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                          OBSERVABILITY LAYER                                          │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│  All services auto-instrument via OTel SDK:                                          │
│  • kms-api:        @opentelemetry/auto-instrumentations-node                         │
│  • search-api:     @opentelemetry/auto-instrumentations-node                         │
│  • rag-service:    opentelemetry-instrumentation-fastapi                             │
│  • voice-app:      opentelemetry-instrumentation-fastapi                             │
│  • All workers:    opentelemetry-instrumentation                                     │
│                                                                                       │
│  Standard spans emitted:                                                             │
│  • HTTP requests (auto)                                                              │
│  • Database queries (auto — Prisma, SQLAlchemy, psycopg)                            │
│  • Queue publish/consume (manual)                                                    │
│  • Search operations (manual)                                                        │
│  • LLM calls (manual — token counts, latency, model)                                │
│  • Graph traversal (manual — nodes visited, depth, path length)                     │
│  • Embedding generation (manual — chunk count, model, duration)                     │
│                                                                                       │
│  Custom metrics:                                                                     │
│  • files_indexed_total (counter, by source)                                         │
│  • embeddings_generated_total (counter, by model)                                   │
│  • search_latency_ms (histogram, by type: keyword/semantic/hybrid)                  │
│  • rag_query_duration_ms (histogram, by provider)                                   │
│  • graph_traversal_depth (histogram)                                                 │
│  • duplicate_groups_detected_total (counter, by type)                               │
│  • queue_depth (gauge, per queue)                                                    │
│  • llm_tokens_used_total (counter, by provider, model, operation)                   │
│                                                                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack (Latest Versions)

### APIs (NestJS)
| Package | Version | Purpose |
|---------|---------|---------|
| `@nestjs/core` | 11.x | NestJS framework |
| `@nestjs/platform-fastify` | 11.x | Fastify adapter (faster than Express) |
| `@nestjs/swagger` | 11.x | OpenAPI docs |
| `prisma` | 6.x | ORM |
| `@prisma/client` | 6.x | DB client |
| `ioredis` | 5.x | Redis client |
| `bullmq` | 5.x | Queue (RabbitMQ-alternative, or use amqplib) |
| `amqplib` | 0.10.x | RabbitMQ AMQP client |
| `@opentelemetry/sdk-node` | 0.57.x | OTel SDK |
| `pino` | 9.x | Structured logging |
| `zod` | 3.24.x | Schema validation |
| `vitest` | 3.x | Unit/integration tests |
| `@nestjs/testing` | 11.x | NestJS test utilities |

### Workers (Python)
| Package | Version | Purpose |
|---------|---------|---------|
| `fastapi` | 0.115.x | HTTP framework (for rag-service, voice-app) |
| `sqlalchemy` | 2.0.x | ORM (async) |
| `alembic` | 1.14.x | DB migrations |
| `aio-pika` | 9.x | RabbitMQ async client |
| `sentence-transformers` | 3.x | Local embeddings |
| `qdrant-client` | 1.11.x | Qdrant vector store |
| `neo4j` | 5.x | Neo4j driver |
| `langchain` | 0.3.x | LLM orchestration |
| `langchain-community` | 0.3.x | LLM integrations |
| `openai` | 1.x | OpenAI client |
| `spacy` | 3.8.x | NLP / NER |
| `pymupdf` | 1.25.x | PDF extraction (fitz) |
| `python-docx` | 1.x | DOCX extraction |
| `pillow` | 11.x | Image processing |
| `pytesseract` | 0.3.x | OCR |
| `imagehash` | 4.x | Perceptual hashing |
| `leidenalg` | 0.10.x | Community detection |
| `opentelemetry-sdk` | 1.29.x | OTel SDK |
| `opentelemetry-instrumentation-fastapi` | 0.50.x | Auto-instrumentation |
| `pytest` | 8.x | Testing |
| `pytest-asyncio` | 0.24.x | Async test support |
| `factory-boy` | 3.x | Test factories |
| `testcontainers` | 4.x | Integration test containers |

### Frontend (Next.js)
| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 15.x | React framework |
| `react` | 19.x | UI library |
| `typescript` | 5.8.x | Type safety |
| `tailwindcss` | 4.x | Utility CSS |
| `@xyflow/react` | 12.x | Graph visualization (React Flow) |
| `d3` | 7.x | Graph rendering fallback |
| `zustand` | 5.x | State management |
| `@tanstack/react-query` | 5.x | Server state |
| `zod` | 3.24.x | Schema validation |
| `vitest` | 3.x | Unit tests |
| `@playwright/test` | 1.50.x | E2E tests |
| `pnpm` | 10.x | Package manager |
| `turbo` | 2.x | Monorepo build |

---

## Revised Milestone Plan

| Milestone | Weeks | Focus | Key Deliverables |
|-----------|-------|-------|------------------|
| **M0** | 1-2 | Foundation | Monorepo structure, Docker Compose full stack, CI, all health checks |
| **M1** | 3-6 | Auth + Core API | kms-api auth, CRUD, basic Next.js UI, design tokens |
| **M2** | 7-10 | Google Drive | OAuth, scan-worker, file indexing, PostgreSQL FTS |
| **M3** | 11-14 | Embeddings + Search | embed-worker, Qdrant, local Ollama, search-api |
| **M4** | 15-17 | Graph + Traversal | Neo4j, graph-worker, Leiden clustering, path-finding UI |
| **M5** | 18-20 | Obsidian + Notes | obsidian-sync, Notes module, dedup-worker |
| **M6** | 21-23 | RAG + Agents | rag-service, ACP orchestration, chat UI, citations |
| **M7** | 24-26 | Polish + Launch | Junk detection, perf tuning, open-source prep, docs |
