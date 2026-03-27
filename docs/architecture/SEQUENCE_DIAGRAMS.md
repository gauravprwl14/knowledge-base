# Sequence Diagrams — Knowledge Base System

**Version**: 1.0
**Date**: 2026-03-17
**Format**: PlantUML (render at plantuml.com or via VS Code extension)

---

## 1. System Startup & Config Load

```plantuml
@startuml startup
title System Startup — Config Load & Feature Flag Resolution

participant "Docker Compose" as DC
participant "kms-api" as API
participant "ConfigLoader" as CL
participant "CapabilityRegistry" as CR
participant "scan-worker" as SW
participant "embed-worker" as EW
participant "rag-service" as RS

DC -> API : start container
activate API

API -> CL : loadKmsConfig()
activate CL
CL -> CL : merge config hierarchy\n(default → system → user → project → local)
CL -> CL : validate schema (Zod .strict())
CL -> CL : resolveImpacts()\n(propagate disabled flags)
CL --> API : KMSConfig (validated + resolved)
deactivate CL

API -> CR : registerCapabilities(config)
activate CR
CR -> CR : build tool list\nbased on enabled features
CR -> CR : declare agent capabilities\n(ACP handshake data)
CR --> API : CapabilityRegistry ready
deactivate CR

API -> API : start HTTP server :8000
API -> API : start ACP server :9001\n(if agents.acp.enabled)
API -> API : log feature summary\n(enabled / disabled / degraded)

note over API
  [KMS] Features active:
  ✅ keyword search
  ✅ Google Drive connector
  ⚠️  semantic search DISABLED
  ⚠️  RAG chat DISABLED
  (embedding.provider = disabled)
end note

DC -> SW : start container
activate SW
SW -> API : GET /api/v1/config\n(X-API-Key: internal)
API --> SW : KMSConfig (resolved)
SW -> SW : configure connectors\nbased on config
SW -> SW : connect RabbitMQ
SW --> DC : healthy

DC -> EW : start container
activate EW
EW -> API : GET /api/v1/config
API --> EW : KMSConfig
EW -> EW : if embed.enabled=false:\n  log warning, idle
EW --> DC : healthy (or idle if disabled)

@enduml
```

---

## 2. Google Drive Scan Flow

```plantuml
@startuml scan
title Google Drive Scan — Full Pipeline

actor "User (Browser)" as U
participant "web-ui\n(Next.js)" as UI
participant "Next.js BFF\n/api/scan" as BFF
participant "kms-api\n:8000" as API
participant "RabbitMQ\nscan.queue" as MQ
participant "scan-worker" as SW
participant "Google Drive API" as GD
participant "PostgreSQL" as PG
participant "embed.queue" as EQ
participant "OTel Collector" as OC

U -> UI : Click "Scan Google Drive"
UI -> BFF : POST /api/scan\n{ source_id: "gdrive-123" }
BFF -> API : POST /api/v1/scan-jobs\nX-API-Key: kms_xxx

activate API
API -> API : validate request\ncreate ScanJob (PENDING)
API -> PG : INSERT INTO kms_scan_jobs
PG --> API : job_id: "scan-abc"
API -> MQ : publish(scan.queue,\n{ job_id, source_id, type: "google_drive" })
API --> BFF : 202 { job_id: "scan-abc" }
deactivate API

BFF --> UI : { job_id }
UI -> UI : poll GET /api/scan-jobs/scan-abc\nfor progress updates

activate SW
MQ -> SW : consume message
SW -> API : PATCH /api/v1/scan-jobs/scan-abc\n{ status: PROCESSING }
SW -> API : GET /api/v1/sources/gdrive-123/token\n(encrypted OAuth token)
API -> API : decrypt token (AES-256-GCM)
API --> SW : { access_token }

SW -> GD : files.list()\n(paginated, modified_after: last_sync)
loop for each page
  GD --> SW : FileList page
  SW -> SW : extract FileMetadata\n(id, name, mimeType, size, hash)

  loop for each file
    SW -> PG : UPSERT kms_files\n(on conflict: update metadata)
    SW -> OC : span: file_indexed
  end
end

SW -> MQ : publish(embed.queue,\n{ file_ids: [...], job_id })
SW -> API : PATCH /api/v1/scan-jobs/scan-abc\n{ status: COMPLETED, files_found: 347 }
deactivate SW

note over UI
  Progress polling resolves:
  { status: COMPLETED, files: 347 }
end note

@enduml
```

---

## 3. Content Embedding Pipeline

```plantuml
@startuml embed
title Content Embedding Pipeline

participant "embed-worker" as EW
participant "MinIO" as MIO
participant "Google Drive API" as GD
participant "ContentExtractor" as CE
participant "TextChunker" as TC
participant "EmbeddingProvider" as EP
participant "Ollama / OpenAI" as LLM
participant "Qdrant" as QD
participant "PostgreSQL" as PG
participant "graph.queue" as GQ

EW -> EW : consume from embed.queue\n{ file_ids: [...] }

loop for each file_id
  EW -> PG : SELECT * FROM kms_files WHERE id = ?
  PG --> EW : FileRecord\n(mime_type, source_url)

  alt Google Drive file
    EW -> GD : files.get(id, alt=media)
    GD --> EW : raw bytes
  else MinIO file
    EW -> MIO : getObject(bucket, key)
    MIO --> EW : raw bytes
  end

  EW -> CE : extract(bytes, mime_type)
  activate CE
  note over CE
    PDF → pymupdf
    DOCX → python-docx
    Image → pytesseract (OCR)
    MD → markdown parser
    XLSX → openpyxl
    Audio → (skip — transcription worker handles)
  end note
  CE --> EW : extracted_text
  deactivate CE

  EW -> TC : chunk(text, chunk_size=512, overlap=50)
  TC --> EW : chunks: List[str]

  loop for each chunk batch (size=10)
    EW -> EP : embed(chunks)
    activate EP

    alt provider = ollama (enabled)
      EP -> LLM : POST /api/embeddings\n{ model: "nomic-embed-text", prompt: chunks }
      LLM --> EP : embeddings: float[][]
    else provider = openai (enabled)
      EP -> LLM : POST /v1/embeddings
      LLM --> EP : embeddings
    else provider = disabled
      EP --> EW : skip embedding\nlog: "embedding disabled"
      note right: no Qdrant write\nkeyword search still works
    end

    EP --> EW : embeddings
    deactivate EP

    EW -> QD : upsert(collection="file_embeddings",\n points=[{ id, vector, payload: { file_id, chunk_index, text } }])
  end

  EW -> PG : UPDATE kms_files\nSET embedded_at = NOW(),\n    chunk_count = ?
  EW -> GQ : publish(graph.queue, { file_id })
end

@enduml
```

---

## 4. Hybrid Search Flow

```plantuml
@startuml search
title Hybrid Search — Keyword + Semantic + RRF Ranking

actor "User" as U
participant "web-ui" as UI
participant "BFF /api/search" as BFF
participant "search-api\n:8001" as SA
participant "Redis Cache" as RC
participant "PostgreSQL\n(FTS)" as PG
participant "Qdrant\n(Vectors)" as QD
participant "EmbeddingProvider" as EP

U -> UI : type search query:\n"machine learning fundamentals"
UI -> BFF : POST /api/search\n{ query, filters, page }
BFF -> SA : POST /api/v1/search\n(forwards with API key)

activate SA
SA -> RC : GET cache:search:hash(query+filters)
alt Cache hit (5 min TTL)
  RC --> SA : cached SearchResult
  SA --> BFF : 200 (from cache)
else Cache miss
  SA -> SA : validate + parse request

  par Parallel execution
    SA -> PG : SELECT * FROM kms_files\nWHERE to_tsvector('english', content)\n  @@ plainto_tsquery(?)\nORDER BY ts_rank DESC\nLIMIT 50
    PG --> SA : keyword_results: [{id, rank, ...}]
  and
    alt semantic search enabled
      SA -> EP : embed(query)
      EP --> SA : query_vector: float[]
      SA -> QD : search(\n  collection="file_embeddings",\n  vector=query_vector,\n  limit=50,\n  filter=source_filter\n)
      QD --> SA : semantic_results: [{id, score, ...}]
    else semantic disabled
      SA -> SA : semantic_results = []
    end
  end

  SA -> SA : RRF merge:\nscore = Σ 1/(k + rank_i)\n(keyword weight=0.4, semantic weight=0.6)

  SA -> SA : apply filters\n(file_type, source, date_range)
  SA -> SA : paginate (limit=20)

  SA -> RC : SET cache:search:hash\n(TTL: 300s)
  SA --> BFF : 200 SearchResult[]
end
deactivate SA

BFF --> UI : search results
UI -> UI : render results\nwith file previews

@enduml
```

---

## 5. RAG Question-Answering Flow

```plantuml
@startuml rag
title RAG Chat — Graph-Aware Q&A with Citations

actor "User" as U
participant "web-ui\n(Chat UI)" as UI
participant "BFF /api/agents" as BFF
participant "kms-api\nOrchestrator" as ORCH
participant "search-api" as SA
participant "graph-api" as GA
participant "rag-service\n:8002" as RAG
participant "Qdrant" as QD
participant "Neo4j" as N4J
participant "LLM Provider\n(Ollama/OpenRouter)" as LLM
participant "Redis\n(conversation)" as RC

U -> UI : "What are the key concepts in my ML notes?"
UI -> BFF : POST /api/agents/run\n{ input: [{role:"user", content:"..."}]\n  session_id: "sess-abc"\n  stream: true }
BFF -> ORCH : POST /api/v1/agents/orchestrator/runs

activate ORCH
ORCH -> ORCH : classifyIntent()\n→ type: "question"
ORCH -> RC : GET session:sess-abc\n(conversation history)
RC --> ORCH : previous_turns[]

par Parallel context gathering
  ORCH -> SA : POST /api/v1/search\n{ query, stream: false }
  SA --> ORCH : search_results (top 10)
and
  ORCH -> GA : POST /api/v1/graph/traverse\n{ query_entities, depth: 3 }
  GA -> N4J : MATCH path from entities...\nLIMIT 20
  N4J --> GA : graph_paths[]
  GA --> ORCH : graph_context
end

ORCH -> RAG : POST /api/v1/rag/ask\n{ question, search_results\n  graph_context, history\n  stream: true }
deactivate ORCH

activate RAG
RAG -> RAG : build prompt:\n  - system context\n  - graph community summaries\n  - top-K chunks\n  - conversation history
RAG -> QD : search chunks by query vector\n(top 5 per result)
QD --> RAG : relevant chunks[]

RAG -> LLM : stream completion\n(context + question)
loop streaming tokens
  LLM --> RAG : token
  RAG --> BFF : SSE: data: {"token": "..."}
  BFF --> UI : stream token
  UI -> UI : render token in chat
end

RAG -> RAG : extract citations\nfrom generated text
RAG --> BFF : SSE: data: {"citations": [...], "done": true}
BFF --> UI : final citations
deactivate RAG

RAG -> RC : SET session:sess-abc\n(append turn, TTL: 24h)

UI -> UI : render answer + citation cards\n(click citation → open file)

@enduml
```

---

## 6. Obsidian Sync Flow

```plantuml
@startuml obsidian
title Obsidian Vault Sync — Bidirectional

participant "Obsidian App" as OB
participant "KMS Plugin\n(TypeScript)" as PLG
participant "SyncManager" as SM
participant "kms-api\n:8000" as API
participant "RabbitMQ\nsync.queue" as MQ
participant "obsidian-sync\nworker" as OSW
participant "PostgreSQL" as PG
participant "embed.queue" as EQ
participant "Neo4j\n(backlinks)" as N4J

== PUSH: Note Changed in Vault ==

OB -> PLG : file:modify event\n(Notes/ML Basics.md)
PLG -> SM : enqueue(file, event="modify")
SM -> SM : debounce 2s\n(batch rapid changes)
SM -> PLG : parseFrontmatter(file)
PLG -> PLG : extract:\n- frontmatter (tags, aliases)\n- [[backlinks]]\n- content hash

SM -> API : POST /api/v1/notes/sync\n{ vault_path, content\n  frontmatter, backlinks\n  checksum, last_modified }
activate API
API -> API : check checksum:\nalready indexed? skip.
API -> PG : UPSERT kms_notes
API -> MQ : publish(sync.queue, { note_id })
API --> SM : 200 { note_id: "note-xyz", status: "queued" }
deactivate API

OSW -> MQ : consume sync message
OSW -> OSW : parse markdown\nresolve [[backlinks]]
OSW -> PG : UPDATE kms_notes\nSET content_extracted_at = NOW()
OSW -> N4J : MERGE (n:Note {id: "note-xyz"})\nMERGE (b:Note {vault_path: "[[ML Basics]]"})\nMERGE (n)-[:LINKS_TO]->(b)
OSW -> EQ : publish(embed.queue, { note_id })

== PULL: KMS Suggests Related Content ==

PLG -> PLG : user opens note\n"Notes/ML Basics.md"
PLG -> API : GET /api/v1/notes/related\n?vault_path=Notes/ML+Basics.md&limit=5
activate API
API -> API : find note_id by vault_path
API --> PLG : { related: [\n  { name: "Neural Networks Paper.pdf"\n    source: "Google Drive"\n    similarity: 0.91 },\n  { name: "Deep Learning Notes"\n    source: "obsidian"\n    similarity: 0.87 }\n] }
deactivate API

PLG -> OB : update sidebar panel\nwith related files list

@enduml
```

---

## 7. Feature Flag Config Load & Impact Propagation

```plantuml
@startuml config
title Config Load — Feature Flag Impact Resolution

participant "ConfigLoader" as CL
participant "FeatureImpactResolver" as FIR
participant "Logger" as LOG
participant "CapabilityRegistry" as CR

CL -> CL : read & merge config files\n(4-level hierarchy)
CL -> CL : Zod .parse() — reject unknown fields

CL -> FIR : resolveImpacts(rawConfig)
activate FIR

FIR -> FIR : check embedding.provider
alt embedding disabled
  FIR -> FIR : set search.semantic.enabled = false
  FIR -> FIR : set search.hybrid.enabled = false
  FIR -> FIR : set workers.embed.enabled = false
  FIR -> FIR : set workers.dedup.semantic.enabled = false
  FIR -> FIR : set rag.enabled = false
  FIR -> LOG : warn "Embedding disabled → semantic search, RAG, embed-worker all disabled"
end

FIR -> FIR : check llm.provider
alt llm disabled
  FIR -> FIR : set rag.enabled = false (if not already)
  FIR -> FIR : set agents.rag_agent.enabled = false
  FIR -> FIR : set workers.junk_detector.ml.enabled = false
  FIR -> LOG : warn "LLM disabled → RAG, ML junk detection disabled"
end

FIR -> FIR : check graph.enabled
alt graph disabled
  FIR -> FIR : set workers.graph.enabled = false
  FIR -> FIR : set rag.graph_aware.enabled = false
  FIR -> FIR : set agents.graph_agent.enabled = false
  FIR -> LOG : warn "Graph disabled → graph-worker, graph-agent, graph-aware RAG disabled"
end

FIR --> CL : resolvedConfig
deactivate FIR

CL -> CR : registerFromConfig(resolvedConfig)
activate CR
CR -> CR : for each agent in config.agents.list:\n  if enabled: register with capabilities\n  else: register as unavailable\n         (returns 503 on calls)
CR --> CL : registry ready
deactivate CR

CL -> LOG : info "Config loaded. Active features:\n✅ keyword search\n✅ gdrive connector\n⚠️  semantic search DISABLED\n⚠️  RAG DISABLED"

@enduml
```

---

## 8. ACP Handshake (Editor Integration)

```plantuml
@startuml acp
title ACP Handshake — Zed Editor ↔ KMS Agent

participant "Zed Editor" as ZED
participant "ACP Transport\n(JSON-RPC/stdio)" as ATP
participant "kms-api\nACP Server :9001" as ACP
participant "CapabilityRegistry" as CR
participant "Config" as CFG

ZED -> ATP : launch agent\n(stdio or HTTP)
ATP -> ACP : initialize request\n{ clientCapabilities: {\n   contextMentions: true\n   imageAttachments: true\n   editReview: true\n} }

activate ACP
ACP -> CFG : get resolved KMSConfig
ACP -> CR : getActiveCapabilities()
CR --> ACP : activeTools[], agentCaps

ACP --> ATP : initialize response\n{ protocolVersion: 1\n  agentCapabilities: {\n    tools: [\n      { name: "kms_search", ... },\n      { name: "kms_ask", ... },   ← only if rag.enabled\n      { name: "kms_traverse", ... } ← only if graph.enabled\n    ]\n    sessionCapabilities: { fork, list, resume, close }\n    mcpCapabilities: { http: true, sse: true }\n  }\n}
deactivate ACP

ATP --> ZED : ACP ready\ntools available in slash commands

ZED -> ZED : register KMS tools in command palette:\n  /kms search "machine learning"\n  /kms ask "what are my key AI notes?"\n  /kms traverse note-id

ZED -> ACP : user invokes /kms ask "..."
ACP -> ACP : route to OrchestratorAgent
note right
  stdout: ACP protocol messages only
  stderr: all logs (pino JSON)
  ← Same constraint as @zed-industries/claude-agent-acp
end note
ACP --> ZED : streaming SSE response\nwith citations

@enduml
```
