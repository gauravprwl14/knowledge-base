# Complete Boilerplate Structure — Knowledge Base System

**Version**: 1.0
**Date**: 2026-03-17

---

## Root Monorepo Structure

```
knowledge-base/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # Run all tests on PR
│   │   ├── release.yml               # Semantic release
│   │   ├── docker-build.yml          # Build + push images
│   │   └── contract-tests.yml        # Pact contract tests
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   ├── pull_request_template.md
│   └── CODEOWNERS
│
├── .kms/
│   ├── config.json                   # Project-level KMS config (git-tracked)
│   └── config.local.json             # Local overrides (gitignored)
│
├── config/                           # Docker service configs
│   ├── nginx/
│   │   ├── nginx.conf
│   │   └── sites-available/kms.conf
│   ├── otel-collector.yml
│   ├── prometheus.yml
│   └── grafana/
│       ├── dashboards/
│       │   ├── kms-overview.json
│       │   ├── search-performance.json
│       │   ├── worker-health.json
│       │   └── llm-usage.json
│       └── datasources/
│           ├── prometheus.yml
│           └── jaeger.yml
│
├── services/                         # All microservices
│   ├── kms-api/                      # NestJS 11 — main API
│   ├── search-api/                   # NestJS 11 — search
│   ├── rag-service/                  # FastAPI — RAG
│   ├── scan-worker/                  # Python — file scanning
│   ├── embed-worker/                 # Python — embeddings
│   ├── dedup-worker/                 # Python — deduplication
│   ├── graph-worker/                 # Python — graph indexing
│   ├── junk-detector/                # Python — junk detection
│   ├── obsidian-sync/                # Python — Obsidian watcher
│   └── web-ui/                       # Next.js 15
│
├── packages/                         # Shared packages
│   ├── config/                       # @kb/config — Zod schema, loader
│   ├── design-tokens/                # @kb/tokens — design token system
│   ├── ui/                           # @kb/ui — React component library
│   ├── kms-config-py/                # kms_config — Python config client
│   └── proto/                        # Protobuf definitions (if gRPC added)
│
├── plugins/
│   └── obsidian-kms/                 # Obsidian plugin (TypeScript)
│
├── backend/                          # Existing voice-app (FastAPI)
├── frontend/                         # Existing voice-app (Next.js)
│
├── docs/
│   ├── architecture/
│   │   ├── MASTER_ARCHITECTURE_V2.md
│   │   ├── FEATURE_FLAGS_CONFIG.md
│   │   ├── ACP_INTEGRATION.md
│   │   ├── SEQUENCE_DIAGRAMS.md
│   │   ├── BOILERPLATE_STRUCTURE.md  (this file)
│   │   ├── TDD_STRATEGY.md
│   │   ├── DOCKER_STACK.md
│   │   ├── OBSIDIAN_PLUGIN_ARCHITECTURE.md
│   │   └── PRD/
│   ├── adr/                          # Architecture Decision Records
│   │   ├── ADR-006-*.md
│   │   ├── ADR-007-*.md
│   │   └── ADR-008-*.md
│   └── workflow/
│       └── PARALLEL_WORK_TRACKER.md
│
├── scripts/
│   ├── setup-dev.sh                  # First-time dev setup
│   ├── pull-models.sh                # Pull Ollama models
│   ├── seed-test-data.sh             # Seed development data
│   └── migrate.sh                    # Run DB migrations
│
├── docker-compose.yml                # Development (hot reload)
├── docker-compose.override.yml       # Local overrides (gitignored)
├── docker-compose.test.yml           # Test environment
├── docker-compose.prod.yml           # Production
├── .env.example                      # Environment template
├── .env                              # Local env (gitignored)
├── pnpm-workspace.yaml
├── package.json                      # Root package.json
├── turbo.json                        # Turbo build config
├── tsconfig.base.json
├── .eslintrc.base.js
├── .prettierrc
├── commitlint.config.js
├── .gitignore
├── CLAUDE.md                         # (existing)
└── README.md
```

---

## `packages/config/` — Shared Config Package

```
packages/config/
├── src/
│   ├── schema.ts                     # KMSConfigSchema (Zod) — canonical
│   ├── loader.ts                     # Config file hierarchy loader
│   ├── impact-resolver.ts            # resolveImpacts() function
│   ├── config-api.ts                 # HTTP client to fetch config from kms-api
│   ├── model-aliases.ts              # "sonnet" → "anthropic/claude-sonnet-4-6"
│   ├── defaults.ts                   # Default config values
│   └── index.ts
├── tests/
│   ├── schema.spec.ts                # Zod validation tests
│   ├── impact-resolver.spec.ts       # Impact propagation tests
│   └── loader.spec.ts
├── package.json
└── tsconfig.json
```

---

## `services/kms-api/` — NestJS 11 API

```
services/kms-api/
├── src/
│   ├── main.ts                       # Entry point (Fastify adapter)
│   ├── app.module.ts
│   ├── bootstrap/
│   │   ├── index.ts                  # Bootstrap utilities
│   │   └── process-handlers.ts       # SIGINT/SIGTERM handlers
│   │
│   ├── config/                       # KMS config integration
│   │   ├── kms-config.module.ts
│   │   ├── kms-config.service.ts     # GET /api/v1/config endpoint logic
│   │   └── feature-flags.service.ts  # isEnabled(feature) helper
│   │
│   ├── database/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── prisma.service.ts
│   │   └── repositories/
│   │       ├── base.repository.ts
│   │       ├── files.repository.ts
│   │       ├── notes.repository.ts
│   │       ├── scan-jobs.repository.ts
│   │       └── sources.repository.ts
│   │
│   ├── errors/
│   │   ├── error-codes/              # GEN, VAL, AUT, AUZ, DAT, SRV, EXT
│   │   ├── types/
│   │   └── handlers/
│   │
│   ├── logger/                       # Pino structured logging
│   │   └── pino/
│   │
│   ├── telemetry/                    # OpenTelemetry (auto from startup)
│   │   ├── sdk/
│   │   └── decorators/               # @Trace(), @RecordDuration()
│   │
│   ├── common/
│   │   ├── decorators/
│   │   ├── filters/                  # Global exception filter
│   │   ├── guards/                   # JwtAuthGuard, ApiKeyGuard
│   │   ├── interceptors/             # TransformInterceptor (response wrapper)
│   │   ├── middleware/               # RequestId, CorrelationId
│   │   ├── pipes/                    # ZodValidationPipe
│   │   └── dto/                      # Common DTOs
│   │
│   ├── cache/                        # Redis cache module
│   ├── queue/                        # RabbitMQ publisher module
│   │
│   └── modules/
│       ├── auth/                     # JWT + API key auth
│       │   ├── auth.module.ts
│       │   ├── auth.controller.ts
│       │   ├── auth.controller.spec.ts
│       │   ├── auth.service.ts
│       │   ├── auth.service.spec.ts
│       │   ├── strategies/           # JWT, local, api-key strategies
│       │   └── dto/
│       │
│       ├── users/
│       ├── api-keys/
│       │
│       ├── sources/                  # Google Drive, Obsidian, etc.
│       │   ├── sources.module.ts
│       │   ├── sources.controller.ts
│       │   ├── sources.controller.spec.ts
│       │   ├── sources.service.ts
│       │   ├── sources.service.spec.ts
│       │   ├── oauth/
│       │   │   ├── google-oauth.service.ts
│       │   │   └── token-encryption.service.ts
│       │   └── dto/
│       │
│       ├── files/
│       │   ├── files.module.ts
│       │   ├── files.controller.ts
│       │   ├── files.controller.spec.ts
│       │   ├── files.service.ts
│       │   ├── files.service.spec.ts
│       │   └── dto/
│       │
│       ├── notes/                    # Personal notes capture
│       │   ├── notes.module.ts
│       │   ├── notes.controller.ts
│       │   ├── notes.controller.spec.ts
│       │   ├── notes.service.ts
│       │   ├── notes.service.spec.ts
│       │   └── dto/
│       │
│       ├── scan-jobs/                # Job orchestration
│       │   ├── scan-jobs.module.ts
│       │   ├── scan-jobs.controller.ts
│       │   ├── scan-jobs.service.ts
│       │   └── dto/
│       │
│       ├── agents/                   # ACP agent orchestration
│       │   ├── agents.module.ts
│       │   ├── registry/
│       │   │   ├── agent-registry.service.ts
│       │   │   └── agent-registry.service.spec.ts
│       │   ├── orchestrator/
│       │   │   ├── orchestrator.service.ts
│       │   │   └── orchestrator.service.spec.ts
│       │   ├── acp/
│       │   │   ├── acp-server.ts       # Editor ACP (JSON-RPC)
│       │   │   └── acp-server.spec.ts
│       │   ├── mcp/
│       │   │   ├── mcp-server.ts       # MCP tool exposure
│       │   │   └── tools/
│       │   │       ├── search.tool.ts
│       │   │       ├── graph.tool.ts
│       │   │       └── rag.tool.ts
│       │   └── dto/
│       │
│       ├── config/                   # Config API endpoints
│       │   ├── config.controller.ts  # GET /api/v1/config
│       │   └── config.controller.spec.ts
│       │
│       └── health/                   # Health checks
│
├── test/
│   ├── setup.ts
│   ├── helpers/
│   ├── factories/
│   └── integration/
│       ├── auth.integration.spec.ts
│       ├── files.integration.spec.ts
│       └── agents.integration.spec.ts
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── Dockerfile
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## `services/search-api/` — NestJS 11 Search

```
services/search-api/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── modules/
│   │   ├── search/
│   │   │   ├── search.module.ts
│   │   │   ├── search.controller.ts
│   │   │   ├── search.controller.spec.ts
│   │   │   ├── search.service.ts
│   │   │   ├── search.service.spec.ts
│   │   │   ├── providers/
│   │   │   │   ├── keyword-search.provider.ts   # PostgreSQL FTS
│   │   │   │   ├── semantic-search.provider.ts  # Qdrant
│   │   │   │   └── hybrid-merger.ts             # RRF algorithm
│   │   │   └── dto/
│   │   ├── graph/
│   │   │   ├── graph.module.ts
│   │   │   ├── graph.controller.ts
│   │   │   ├── graph.service.ts
│   │   │   ├── traversal.service.ts             # Neo4j traversal
│   │   │   ├── community.service.ts             # Leiden cluster queries
│   │   │   └── dto/
│   │   └── health/
│   ├── cache/                                    # Redis search cache
│   ├── telemetry/
│   └── config/
├── test/
│   └── integration/
│       ├── search.integration.spec.ts
│       └── graph.integration.spec.ts
├── Dockerfile
├── package.json
└── vitest.config.ts
```

---

## `services/rag-service/` — Python FastAPI

```
services/rag-service/
├── app/
│   ├── main.py                       # FastAPI entry point
│   ├── config.py                     # Pydantic settings + KMS config client
│   │
│   ├── api/
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── ask.py                # POST /api/v1/rag/ask
│   │       ├── stream.py             # SSE streaming endpoint
│   │       └── sessions.py           # Conversation session management
│   │
│   ├── services/
│   │   ├── rag_pipeline.py           # LangChain RAG pipeline
│   │   ├── context_retriever.py      # Qdrant + graph context retrieval
│   │   ├── graph_enricher.py         # Neo4j graph context builder
│   │   ├── prompt_builder.py         # Context → prompt assembly
│   │   ├── citation_tracker.py       # Track source citations
│   │   └── conversation_memory.py    # Redis-backed conversation history
│   │
│   ├── providers/
│   │   ├── base_llm.py               # Abstract LLM provider
│   │   ├── ollama_provider.py        # Ollama local LLM
│   │   ├── openrouter_provider.py    # OpenRouter (Claude, GPT-4o, etc.)
│   │   ├── openai_provider.py        # Direct OpenAI
│   │   └── provider_factory.py       # Create from config
│   │
│   ├── telemetry/
│   │   └── otel.py                   # OTel setup + LLM token tracking
│   │
│   └── schemas/
│       ├── ask.py                    # Pydantic request/response schemas
│       └── session.py
│
├── tests/
│   ├── conftest.py
│   ├── unit/
│   │   ├── test_rag_pipeline.py
│   │   ├── test_context_retriever.py
│   │   ├── test_citation_tracker.py
│   │   └── test_ollama_provider.py
│   └── integration/
│       └── test_rag_integration.py
│
├── Dockerfile
├── pyproject.toml
└── requirements.txt
```

---

## `services/scan-worker/` — Python Worker

```
services/scan-worker/
├── app/
│   ├── __init__.py
│   ├── main.py                       # Worker entry point
│   ├── config.py                     # Loads config from kms-api
│   │
│   ├── connectors/
│   │   ├── __init__.py
│   │   ├── base.py                   # BaseConnector ABC
│   │   ├── google_drive.py           # GoogleDriveConnector
│   │   ├── obsidian.py               # ObsidianConnector
│   │   ├── local_fs.py               # LocalFSConnector
│   │   ├── external_drive.py         # ExternalDriveConnector
│   │   └── registry.py               # ConnectorRegistry (maps source_type → connector)
│   │
│   ├── services/
│   │   ├── file_scanner.py           # Orchestrate scan
│   │   ├── metadata_extractor.py     # Extract file metadata
│   │   └── job_updater.py            # PATCH scan job status
│   │
│   ├── workers/
│   │   ├── consumer.py               # RabbitMQ consumer (scan.queue)
│   │   └── publisher.py              # Publish to embed.queue
│   │
│   └── telemetry/
│       └── otel.py
│
├── tests/
│   ├── conftest.py                   # testcontainers fixtures
│   ├── factories/
│   │   ├── file_factory.py
│   │   └── job_factory.py
│   ├── unit/
│   │   ├── connectors/
│   │   │   ├── test_google_drive.py
│   │   │   ├── test_obsidian.py
│   │   │   └── test_local_fs.py
│   │   └── services/
│   │       └── test_file_scanner.py
│   └── integration/
│       └── test_scan_pipeline.py     # Full scan → DB write → queue publish
│
├── Dockerfile
└── pyproject.toml
```

---

## `services/embed-worker/` — Python Worker

```
services/embed-worker/
├── app/
│   ├── main.py
│   ├── config.py
│   │
│   ├── extractors/
│   │   ├── base.py                   # BaseExtractor ABC
│   │   ├── pdf_extractor.py          # pymupdf
│   │   ├── docx_extractor.py         # python-docx
│   │   ├── image_extractor.py        # pytesseract (OCR)
│   │   ├── markdown_extractor.py     # frontmatter + body
│   │   ├── spreadsheet_extractor.py  # openpyxl
│   │   └── registry.py               # mime_type → extractor
│   │
│   ├── chunking/
│   │   └── recursive_chunker.py      # Recursive character text splitter
│   │
│   ├── embeddings/
│   │   ├── base.py                   # BaseEmbeddingProvider ABC
│   │   ├── ollama.py                 # Ollama nomic-embed-text
│   │   ├── openai.py                 # text-embedding-3-small
│   │   ├── openrouter.py
│   │   └── factory.py                # Create from config
│   │
│   ├── storage/
│   │   └── qdrant_writer.py          # Write vectors to Qdrant
│   │
│   ├── workers/
│   │   ├── consumer.py               # consume embed.queue
│   │   └── publisher.py              # publish graph.queue, dedup.queue
│   │
│   └── telemetry/
│
├── tests/
│   ├── conftest.py
│   ├── unit/
│   │   ├── extractors/
│   │   │   ├── test_pdf_extractor.py
│   │   │   ├── test_image_extractor.py
│   │   │   └── test_markdown_extractor.py
│   │   ├── test_chunker.py
│   │   └── test_ollama_embedder.py
│   └── integration/
│       └── test_embed_pipeline.py    # Full extract → chunk → embed → Qdrant
│
├── Dockerfile
└── pyproject.toml
```

---

## `services/graph-worker/` — Python Worker

```
services/graph-worker/
├── app/
│   ├── main.py
│   ├── config.py
│   │
│   ├── builders/
│   │   ├── hierarchy_builder.py      # File/Folder nodes
│   │   ├── entity_builder.py         # NER → Entity nodes
│   │   ├── similarity_builder.py     # SIMILAR_TO edges (Qdrant → Neo4j)
│   │   └── community_builder.py      # Leiden algorithm → Cluster nodes
│   │
│   ├── ner/
│   │   ├── spacy_ner.py              # spaCy en_core_web_sm
│   │   └── llm_ner.py                # LLM-based NER (if enabled)
│   │
│   ├── clustering/
│   │   └── leiden.py                 # leidenalg wrapper
│   │
│   ├── neo4j/
│   │   ├── client.py                 # Neo4j async driver
│   │   ├── schema.py                 # Constraints + indexes setup
│   │   └── queries.py                # Cypher query builders
│   │
│   ├── workers/
│   │   └── consumer.py               # consume graph.queue
│   │
│   └── telemetry/
│
├── tests/
│   ├── unit/
│   │   ├── test_entity_builder.py
│   │   ├── test_leiden.py
│   │   └── test_similarity_builder.py
│   └── integration/
│       └── test_graph_pipeline.py
│
├── Dockerfile
└── pyproject.toml
```

---

## `services/web-ui/` — Next.js 15

```
services/web-ui/
├── app/
│   ├── layout.tsx                    # Root layout + providers
│   ├── page.tsx                      # Landing / redirect
│   ├── globals.css                   # @theme tokens + Tailwind
│   │
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   │
│   ├── (dashboard)/
│   │   ├── layout.tsx                # Dashboard shell (nav + sidebar)
│   │   ├── page.tsx                  # Dashboard home
│   │   │
│   │   ├── search/
│   │   │   └── page.tsx              # Search with filters
│   │   │
│   │   ├── chat/
│   │   │   └── page.tsx              # RAG chat (hidden if rag.enabled=false)
│   │   │
│   │   ├── knowledge-graph/
│   │   │   └── page.tsx              # React Flow graph (hidden if graph.enabled=false)
│   │   │
│   │   ├── notes/
│   │   │   ├── page.tsx              # Notes list
│   │   │   └── [id]/page.tsx
│   │   │
│   │   ├── files/
│   │   │   ├── page.tsx              # All indexed files
│   │   │   └── [id]/page.tsx
│   │   │
│   │   ├── sources/
│   │   │   └── page.tsx              # Connect/manage sources
│   │   │
│   │   └── duplicates/
│   │       └── page.tsx
│   │
│   └── api/                          # BFF — Next.js API routes
│       └── v1/
│           ├── auth/route.ts
│           ├── search/route.ts
│           ├── agents/route.ts       # Forward to kms-api ACP
│           ├── files/route.ts
│           ├── notes/route.ts
│           ├── sources/route.ts
│           └── config/features/route.ts  # Expose feature flags to UI
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Topbar.tsx
│   │   └── FeatureGate.tsx           # Hide UI sections based on feature flags
│   ├── search/
│   │   ├── SearchBar.tsx
│   │   ├── SearchResults.tsx
│   │   └── FileCard.tsx
│   ├── chat/
│   │   ├── ChatPanel.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── CitationCard.tsx
│   │   └── StreamingText.tsx
│   ├── graph/
│   │   ├── KnowledgeGraph.tsx        # React Flow + @xyflow/react
│   │   ├── NodeInspector.tsx
│   │   └── CommunityPanel.tsx
│   ├── notes/
│   │   ├── NoteEditor.tsx
│   │   └── NoteCard.tsx
│   └── ui/                           # Reusable primitives from @kb/ui
│
├── lib/
│   ├── api.ts                        # KMS API client (all endpoints)
│   ├── features.ts                   # Feature flag client (fetch from BFF)
│   ├── hooks/
│   │   ├── use-features.ts           # useFeaturesQuery() — React Query
│   │   ├── use-search.ts
│   │   └── use-chat.ts
│   └── types/
│
├── tests/
│   ├── unit/
│   │   ├── components/
│   │   │   ├── SearchBar.spec.tsx
│   │   │   ├── FeatureGate.spec.tsx
│   │   │   └── CitationCard.spec.tsx
│   │   └── lib/
│   │       └── features.spec.ts
│   └── e2e/
│       ├── search.spec.ts
│       ├── chat.spec.ts              # Skipped if rag.enabled=false
│       └── graph.spec.ts             # Skipped if graph.enabled=false
│
├── Dockerfile
├── next.config.ts
├── tailwind.config.ts
├── vitest.config.ts
└── playwright.config.ts
```

---

## `plugins/obsidian-kms/` — Obsidian Plugin

```
plugins/obsidian-kms/
├── src/
│   ├── main.ts                       # Plugin entry, register commands
│   ├── settings/
│   │   ├── settings.ts               # PluginSettings interface (Zod)
│   │   └── settings-tab.ts           # Obsidian settings UI
│   ├── sync/
│   │   ├── vault-watcher.ts          # this.app.vault.on('modify', ...)
│   │   ├── sync-manager.ts           # Queue + debounce + retry
│   │   └── sync-queue.ts
│   ├── parsers/
│   │   ├── markdown-parser.ts        # gray-matter for frontmatter
│   │   ├── backlink-resolver.ts      # [[wikilink]] extraction
│   │   └── tag-extractor.ts          # #tag extraction
│   ├── ui/
│   │   ├── sidebar-view.ts           # Related files panel (ItemView)
│   │   ├── search-modal.ts           # Global search (SuggestModal)
│   │   └── status-bar.ts             # Sync status in status bar
│   ├── api/
│   │   ├── kms-client.ts             # HTTP client for kms-api
│   │   └── types.ts
│   └── connectors/                   # Plug-and-play additional connectors
│       ├── base.ts
│       └── registry.ts
│
├── tests/
│   ├── unit/
│   │   ├── markdown-parser.spec.ts
│   │   ├── backlink-resolver.spec.ts
│   │   └── sync-manager.spec.ts
│   └── integration/
│       └── kms-client.spec.ts
│
├── styles.css
├── manifest.json
├── package.json                      # vitest, obsidian types
└── tsconfig.json
```

---

## `packages/design-tokens/` — Design Token System

```
packages/design-tokens/
├── src/
│   ├── primitive/
│   │   ├── colors.ts                 # color-blue-500, color-gray-100...
│   │   ├── spacing.ts                # spacing-1 = 0.25rem...
│   │   ├── typography.ts             # font-size-sm = 0.875rem...
│   │   └── radius.ts
│   ├── semantic/
│   │   ├── colors.ts                 # color-primary → color-blue-500
│   │   ├── feedback.ts               # color-error, color-success
│   │   └── layout.ts
│   ├── component/
│   │   ├── button.ts
│   │   ├── card.ts
│   │   └── input.ts
│   └── index.ts
├── generated/
│   ├── css/globals.css               # @theme { --color-primary: ... }
│   └── js/tokens.ts
├── scripts/
│   └── generate.ts                   # Token generation script
├── package.json
└── tsconfig.json
```

---

## Key Prisma Schema (PostgreSQL)

```prisma
// services/kms-api/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ── Auth Domain ─────────────────────────────────────────────

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  role         Role     @default(USER)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  apiKeys  ApiKey[]
  sources  Source[]
  notes    Note[]
  scanJobs ScanJob[]
}

model ApiKey {
  id        String    @id @default(uuid())
  keyHash   String    @unique
  name      String
  isActive  Boolean   @default(true)
  scopes    String[]
  expiresAt DateTime?
  createdAt DateTime  @default(now())

  user   User   @relation(fields: [userId], references: [id])
  userId String
}

// ── KMS Domain ──────────────────────────────────────────────

model Source {
  id          String     @id @default(uuid())
  type        SourceType // GOOGLE_DRIVE, OBSIDIAN, LOCAL_FS, EXTERNAL_DRIVE
  displayName String
  status      SourceStatus @default(ACTIVE)
  credentials Json?      // encrypted OAuth tokens (AES-256-GCM)
  config      Json?      // source-specific config
  lastSyncAt  DateTime?
  createdAt   DateTime   @default(now())

  user   User   @relation(fields: [userId], references: [id])
  userId String

  files    KmsFile[]
  scanJobs ScanJob[]
}

model KmsFile {
  id               String      @id @default(uuid())
  sourceFileId     String                       // ID in source system
  name             String
  path             String
  mimeType         String
  sizeBytes        BigInt?
  contentHash      String?                      // SHA-256
  contentExtracted Boolean     @default(false)
  embeddedAt       DateTime?
  chunkCount       Int?
  status           FileStatus  @default(PENDING)
  metadata         Json?                        // source-specific metadata
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt

  source   Source @relation(fields: [sourceId], references: [id])
  sourceId String

  transcription KmsTranscription?
  duplicateOf   FileDuplicate[]   @relation("duplicate")
  duplicates    FileDuplicate[]   @relation("original")

  @@unique([sourceId, sourceFileId])
  @@index([contentHash])
  @@index([mimeType])
}

model Note {
  id          String   @id @default(uuid())
  title       String
  content     String
  vaultPath   String?                          // Obsidian vault path
  frontmatter Json?
  tags        String[]
  backlinks   String[]                         // [[wikilinks]] extracted
  checksum    String?
  embeddedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user   User   @relation(fields: [userId], references: [id])
  userId String

  @@index([tags])
}

model ScanJob {
  id          String    @id @default(uuid())
  status      JobStatus @default(PENDING)
  filesFound  Int?
  filesIndexed Int?
  errorMessage String?
  startedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime  @default(now())

  source   Source @relation(fields: [sourceId], references: [id])
  sourceId String

  user   User   @relation(fields: [userId], references: [id])
  userId String
}

model FileDuplicate {
  id             String        @id @default(uuid())
  type           DuplicateType // EXACT, SEMANTIC, VERSION, IMAGE_PHASH
  similarity     Float?
  reviewedAt     DateTime?
  resolution     String?

  original   KmsFile @relation("original", fields: [originalId], references: [id])
  originalId String

  duplicate   KmsFile @relation("duplicate", fields: [duplicateId], references: [id])
  duplicateId String

  @@unique([originalId, duplicateId])
}

// ── Enums ───────────────────────────────────────────────────

enum SourceType {
  GOOGLE_DRIVE
  OBSIDIAN
  LOCAL_FS
  EXTERNAL_DRIVE
}

enum FileStatus {
  PENDING
  INDEXED
  EMBEDDED
  FAILED
  EXCLUDED
}

enum JobStatus {
  PENDING
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED
}

enum DuplicateType {
  EXACT
  SEMANTIC
  VERSION
  IMAGE_PHASH
}

enum Role {
  USER
  ADMIN
}

enum SourceStatus {
  ACTIVE
  PAUSED
  ERROR
  DISCONNECTED
}
```

---

## `.kms/config.json` — Default Project Config

```json
{
  "version": "1.0",
  "embedding": {
    "provider": "ollama",
    "enabled": true,
    "model": "nomic-embed-text",
    "dimensions": 768
  },
  "llm": {
    "provider": "ollama",
    "enabled": true,
    "model": "llama3.2:3b"
  },
  "search": {
    "enabled": true,
    "keyword": { "enabled": true },
    "semantic": { "enabled": true },
    "hybrid": {
      "enabled": true,
      "keyword_weight": 0.4,
      "semantic_weight": 0.6
    },
    "cache": { "enabled": true, "ttl_seconds": 300 }
  },
  "graph": {
    "enabled": true,
    "traversal": { "enabled": true, "max_depth": 6 },
    "community_detection": { "enabled": true, "algorithm": "leiden" },
    "entity_extraction": { "enabled": true, "provider": "spacy" }
  },
  "rag": {
    "enabled": true,
    "graph_aware": { "enabled": true },
    "streaming": { "enabled": true },
    "conversation_memory": { "enabled": true, "max_turns": 20 },
    "citations": { "enabled": true }
  },
  "connectors": {
    "google_drive": { "enabled": false },
    "obsidian": { "enabled": false },
    "local_fs": { "enabled": false },
    "external_drive": { "enabled": false }
  },
  "workers": {
    "scan": { "enabled": true, "concurrency": 2 },
    "embed": { "enabled": true, "concurrency": 2, "batch_size": 10 },
    "dedup": { "enabled": true },
    "graph": { "enabled": true },
    "junk_detector": { "enabled": true },
    "transcription": { "enabled": false }
  },
  "agents": {
    "enabled": true,
    "acp": { "enabled": true, "bind": "127.0.0.1:9001" },
    "orchestrator": { "enabled": true, "model": "ollama/llama3.2:3b" }
  },
  "observability": {
    "enabled": true,
    "otel": { "enabled": true, "endpoint": "http://otel-collector:4317" },
    "logging": { "level": "info", "format": "json" }
  },
  "queue": {
    "provider": "rabbitmq",
    "prefetch": 1
  },
  "storage": {
    "provider": "minio"
  }
}
```
