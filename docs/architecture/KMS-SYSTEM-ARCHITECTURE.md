---
id: arch-kms-system-overview
created_at: 2026-03-18T00:00:00Z
content_type: index
status: current
generator_model: claude-sonnet-4-6
---

# KMS System Architecture

## 1. High-Level System Context (C4 Level 1)

```mermaid
C4Context
  title KMS — System Context

  Person(user, "Knowledge Worker", "Uses KMS to store, search, and chat with their knowledge base")
  Person(dev, "Developer / Claude Code", "Uses MCP tools to search KMS during coding")

  System(kms, "KMS Platform", "Knowledge Management System — ingest, index, search, chat")

  System_Ext(google_drive, "Google Drive", "Document source")
  System_Ext(obsidian, "Obsidian Vault", "Markdown knowledge base")
  System_Ext(anthropic, "Anthropic Claude API", "LLM for generation, summarization, tagging")
  System_Ext(youtube, "YouTube", "Video transcript source")

  Rel(user, kms, "Ingests docs, searches, chats via", "HTTPS / SSE")
  Rel(dev, kms, "Searches knowledge base via", "MCP over stdio/HTTP")
  Rel(kms, google_drive, "Pulls files via", "Google Drive API v3")
  Rel(kms, obsidian, "Reads vault from", "Local filesystem")
  Rel(kms, anthropic, "Streams responses from", "Anthropic API (HTTPS)")
  Rel(kms, youtube, "Extracts transcripts via", "yt-dlp")
```

## 2. Container Diagram (C4 Level 2)

```mermaid
C4Container
  title KMS — Containers

  Person(user, "User", "Web browser")

  Container(frontend, "Frontend", "Next.js 14, React, Tailwind", "Drive browser, chat, search UI")
  Container(kms_api, "kms-api", "NestJS 11 / Fastify", "REST API: auth, sources, files, ACP gateway, workflow engine")
  Container(search_api, "search-api", "NestJS 11 / Fastify", "Read-only hybrid search: BM25 + semantic + RRF")
  Container(rag_service, "rag-service", "FastAPI / Python", "RAG pipeline, tiered retrieval, SSE chat, LangGraph")
  Container(scan_worker, "scan-worker", "Python / aio-pika", "AMQP consumer: file discovery, connector dispatch")
  Container(embed_worker, "embed-worker", "Python / aio-pika", "AMQP consumer: text extraction, BGE-M3 embedding")
  Container(dedup_worker, "dedup-worker", "Python / aio-pika", "AMQP consumer: SHA-256 + semantic dedup")
  Container(graph_worker, "graph-worker", "Python / aio-pika", "AMQP consumer: Neo4j entity extraction")
  Container(url_agent, "url-agent", "FastAPI / Python", "YouTube transcript + web page extraction (port 8004)")
  Container(voice_app, "voice-app", "FastAPI / Python", "Audio transcription via Whisper (port 8003)")

  ContainerDb(postgres, "PostgreSQL 16", "Database", "Users, files, sources, collections, tags, chunks")
  ContainerDb(qdrant, "Qdrant", "Vector DB", "1024-dim BGE-M3 dense vectors for semantic search")
  ContainerDb(neo4j, "Neo4j", "Graph DB", "Entity relationships, knowledge graph")
  ContainerDb(redis, "Redis", "Cache / Queue", "Session store, scan locks, BullMQ job queue")
  ContainerDb(rabbitmq, "RabbitMQ", "Message Broker", "kms.scan, kms.embed, kms.dedup, kms.graph queues")

  Rel(user, frontend, "Uses", "HTTPS")
  Rel(frontend, kms_api, "Calls", "REST/JSON, SSE")
  Rel(frontend, rag_service, "Streams chat", "SSE / HTTP")
  Rel(kms_api, search_api, "Proxies search", "HTTP fetch")
  Rel(kms_api, rabbitmq, "Publishes scan jobs", "AMQP")
  Rel(kms_api, redis, "Session store, BullMQ", "Redis protocol")
  Rel(kms_api, postgres, "Reads/writes", "Prisma / pg")
  Rel(rag_service, search_api, "Retrieves context", "HTTP fetch")
  Rel(rag_service, postgres, "LangGraph state", "asyncpg")
  Rel(scan_worker, rabbitmq, "Consumes kms.scan", "AMQP")
  Rel(scan_worker, rabbitmq, "Publishes kms.embed", "AMQP")
  Rel(embed_worker, rabbitmq, "Consumes kms.embed", "AMQP")
  Rel(embed_worker, qdrant, "Upserts vectors", "HTTP")
  Rel(embed_worker, postgres, "Updates file status", "asyncpg")
  Rel(graph_worker, rabbitmq, "Consumes kms.graph", "AMQP")
  Rel(graph_worker, neo4j, "Writes entities", "Bolt")
  Rel(url_agent, rabbitmq, "Publishes kms.embed", "AMQP")
  Rel(kms_api, url_agent, "Triggers ingest", "HTTP fetch")
```

## 3. Drive File Management — Component Diagram

```mermaid
graph TD
  subgraph Frontend["Frontend (Next.js)"]
    DrivePage["Drive Page\n/drive"]
    SourcesTab["Sources Tab\nDriveSourcesClient"]
    FilesTab["Files Tab\nFilesBrowser"]
    FilterPanel["FiltersFilterPanel\nsource/type/status/tags"]
    FileCard["FileCard\ntype badge, tags, actions"]
    BulkBar["BulkActionBar\ndelete, tag, collect"]
    TagPicker["TagPicker\ncreate/assign tags"]
    TagsPage["Tags Page\n/tags"]
  end

  subgraph KmsApi["kms-api (NestJS)"]
    FilesCtrl["FilesController\nGET/DELETE /files\nPOST /files/bulk-*"]
    TagsCtrl["TagsController\nGET/POST/DELETE /tags\nPOST /files/bulk-tag"]
    CollCtrl["CollectionsController\nGET/POST/DELETE /collections"]
    SourcesCtrl["SourcesController\nGET/POST /sources\nPOST /sources/:id/scan"]
  end

  subgraph DB["PostgreSQL"]
    FilesTable["kms_files"]
    TagsTable["kms_tags"]
    FileTagsTable["kms_file_tags"]
    CollTable["kms_collections"]
    SourcesTable["kms_sources"]
  end

  DrivePage --> SourcesTab
  DrivePage --> FilesTab
  FilesTab --> FilterPanel
  FilesTab --> FileCard
  FilesTab --> BulkBar
  BulkBar --> TagPicker
  FilesTab --> TagsPage

  FilesTab --> FilesCtrl
  FilterPanel --> FilesCtrl
  FilterPanel --> TagsCtrl
  BulkBar --> FilesCtrl
  BulkBar --> TagsCtrl
  BulkBar --> CollCtrl

  FilesCtrl --> FilesTable
  TagsCtrl --> TagsTable
  TagsCtrl --> FileTagsTable
  CollCtrl --> CollTable
  SourcesCtrl --> SourcesTable
```

## 4. Tag System Data Flow

```mermaid
sequenceDiagram
  participant User as User
  participant UI as Frontend
  participant API as kms-api
  participant DB as PostgreSQL

  Note over User,DB: Create a tag
  User->>UI: Click "+ Create Tag" (name="Research", color="#6366f1")
  UI->>API: POST /tags { name, color }
  API->>DB: INSERT INTO kms_tags
  DB-->>API: { id, name, color }
  API-->>UI: 201 { id, name, color, fileCount: 0 }
  UI->>UI: invalidate ['tags'] query → refetch

  Note over User,DB: Apply tag to selected files (bulk)
  User->>UI: Select 5 files → click Add Tag → pick "Research"
  UI->>API: POST /files/bulk-tag { fileIds: [5 IDs], tagId }
  API->>DB: INSERT INTO kms_file_tags (batch, skipDuplicates)
  DB-->>API: { count: 5 }
  API-->>UI: 200 { tagged: 5 }
  UI->>UI: invalidate ['files'] query → file cards show tag

  Note over User,DB: Filter files by tag
  User->>UI: Click "Research" tag in filter panel
  UI->>API: GET /files?tags[]=Research
  API->>DB: SELECT files JOIN file_tags JOIN tags WHERE tags.name IN (...)
  DB-->>API: { items: [...], nextCursor, total }
  API-->>UI: Filtered file list
```

## 5. ACP + RAG Chat Flow (End-to-End)

```mermaid
sequenceDiagram
  participant Browser as Browser
  participant Frontend as Frontend
  participant KmsApi as kms-api
  participant SearchApi as search-api
  participant RagService as rag-service
  participant Anthropic as Anthropic Claude

  Browser->>Frontend: Opens /chat, types question
  Frontend->>KmsApi: POST /acp/v1/initialize
  KmsApi-->>Frontend: { sessionId }

  Frontend->>KmsApi: POST /acp/v1/sessions/:id/prompt (SSE)
  Note over KmsApi: AcpService.runPrompt()
  KmsApi->>SearchApi: POST /search { query, x-user-id }
  SearchApi-->>KmsApi: { items: [5 results] }

  KmsApi->>Anthropic: messages.create (stream=true)\nsystem: KMS context + search results\nuser: question
  loop SSE stream
    Anthropic-->>KmsApi: delta { type: "content_block_delta", text }
    KmsApi-->>Frontend: event: chunk\ndata: { text }
  end
  KmsApi-->>Frontend: event: done\ndata: {}
  Frontend->>Browser: Renders streamed answer
```
