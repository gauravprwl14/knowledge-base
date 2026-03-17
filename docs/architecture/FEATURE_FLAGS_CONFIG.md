# Feature Flags & Configuration System

**Version**: 1.0
**Date**: 2026-03-17
**Inspired by**: OpenClaw config system, claude-agent-acp settings hierarchy, OpenFeature standard

---

## Core Philosophy

1. **Everything is a feature flag** — no hardcoded capabilities
2. **Explicit opt-in** — `enabled: true` must be declared; omission = disabled
3. **Zod-validated JSON** — `.strict()` schema rejects unknown fields at startup
4. **Impact-aware** — disabling a feature surfaces downstream impacts immediately
5. **4-level config hierarchy** — default → system → user → local (later overrides earlier)
6. **Secrets never in config** — env vars only; config holds references, not values
7. **Provider pattern** — every external dependency has a provider with fallback chain

---

## Config File Location & Hierarchy

```
Priority (lowest → highest):
┌─────────────────────────────────────────────────────────────┐
│  1. Built-in defaults (code)                                │
│  2. /etc/kms/config.json  (system-level, Docker volume)     │
│  3. ~/.kms/config.json    (user-level)                      │
│  4. ./.kms/config.json    (project-level, git-tracked)      │
│  5. ./.kms/config.local.json (local override, gitignored)   │
└─────────────────────────────────────────────────────────────┘
```

Each level is deep-merged using JSON Merge Patch (RFC 7396). `null` value = explicitly delete a field.

---

## Master Config Schema (`kms.config.json`)

```typescript
// packages/config/src/schema.ts — canonical Zod schema
import { z } from 'zod/v4';

// ── Providers ─────────────────────────────────────────────────

const EmbeddingProviderSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('ollama'),
    enabled: z.boolean().default(true),
    host: z.string().default('http://ollama:11434'),
    model: z.string().default('nomic-embed-text'),
    dimensions: z.number().default(768),
    timeout_ms: z.number().default(30000),
  }).strict(),
  z.object({
    provider: z.literal('openai'),
    enabled: z.boolean().default(false),
    model: z.string().default('text-embedding-3-small'),
    dimensions: z.number().default(1536),
    batch_size: z.number().default(100),
    // api_key comes from env: OPENAI_API_KEY
  }).strict(),
  z.object({
    provider: z.literal('openrouter'),
    enabled: z.boolean().default(false),
    model: z.string().default('openai/text-embedding-3-small'),
    // api_key comes from env: OPENROUTER_API_KEY
  }).strict(),
  z.object({
    provider: z.literal('disabled'),
    enabled: z.literal(false),
    // Impact: semantic search disabled, RAG falls back to keyword-only
  }).strict(),
]);

const LLMProviderSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('ollama'),
    enabled: z.boolean().default(true),
    host: z.string().default('http://ollama:11434'),
    model: z.string().default('llama3.2:3b'),
    context_window: z.number().default(4096),
    temperature: z.number().min(0).max(2).default(0.7),
  }).strict(),
  z.object({
    provider: z.literal('openrouter'),
    enabled: z.boolean().default(false),
    model: z.string().default('anthropic/claude-sonnet-4-6'),
    // Model aliases (from OpenClaw pattern)
    // api_key comes from env: OPENROUTER_API_KEY
  }).strict(),
  z.object({
    provider: z.literal('openai'),
    enabled: z.boolean().default(false),
    model: z.string().default('gpt-4o'),
    // api_key comes from env: OPENAI_API_KEY
  }).strict(),
  z.object({
    provider: z.literal('disabled'),
    enabled: z.literal(false),
    // Impact: RAG Q&A disabled, agent orchestration uses keyword-only answers
  }).strict(),
]);

// ── Module Flags ───────────────────────────────────────────────

const SearchModuleSchema = z.object({
  enabled: z.boolean().default(true),
  keyword: z.object({
    enabled: z.boolean().default(true),
    // Always available — requires only PostgreSQL
  }).strict().default({}),
  semantic: z.object({
    enabled: z.boolean().default(true),
    // Requires: embedding provider != disabled
    // Impact if disabled: hybrid search falls back to keyword-only
  }).strict().default({}),
  hybrid: z.object({
    enabled: z.boolean().default(true),
    keyword_weight: z.number().min(0).max(1).default(0.4),
    semantic_weight: z.number().min(0).max(1).default(0.6),
    // Requires: both keyword AND semantic enabled
  }).strict().default({}),
  cache: z.object({
    enabled: z.boolean().default(true),
    ttl_seconds: z.number().default(300),
    // Requires: Redis
    // Impact if disabled: every search hits DB/Qdrant directly
  }).strict().default({}),
}).strict();

const GraphModuleSchema = z.object({
  enabled: z.boolean().default(true),
  // Requires: Neo4j
  // Impact if disabled: no path-finding, no community detection, no backlinks
  traversal: z.object({
    enabled: z.boolean().default(true),
    max_depth: z.number().default(6),
  }).strict().default({}),
  community_detection: z.object({
    enabled: z.boolean().default(true),
    algorithm: z.enum(['leiden', 'louvain']).default('leiden'),
    // Requires: graph module enabled + leidenalg Python package
    min_cluster_size: z.number().default(3),
  }).strict().default({}),
  entity_extraction: z.object({
    enabled: z.boolean().default(true),
    provider: z.enum(['spacy', 'llm', 'disabled']).default('spacy'),
    spacy_model: z.string().default('en_core_web_sm'),
    // Impact if disabled: graph has no entity nodes, only file/folder nodes
  }).strict().default({}),
}).strict();

const RAGModuleSchema = z.object({
  enabled: z.boolean().default(true),
  // Requires: embedding provider + LLM provider + semantic search enabled
  // Impact if disabled: chat UI hidden, /api/v1/agents/rag/runs returns 503
  graph_aware: z.object({
    enabled: z.boolean().default(true),
    // Requires: graph module enabled
    // Impact if disabled: RAG uses vector-only context (no graph enrichment)
  }).strict().default({}),
  streaming: z.object({
    enabled: z.boolean().default(true),
    // Requires: LLM provider that supports streaming
  }).strict().default({}),
  conversation_memory: z.object({
    enabled: z.boolean().default(true),
    max_turns: z.number().default(20),
    // Requires: Redis
  }).strict().default({}),
  citations: z.object({
    enabled: z.boolean().default(true),
  }).strict().default({}),
}).strict();

const ConnectorsSchema = z.object({
  google_drive: z.object({
    enabled: z.boolean().default(false),
    // Requires: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET env vars
    scopes: z.array(z.string()).default([
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ]),
    sync_interval_minutes: z.number().default(60),
    max_file_size_mb: z.number().default(100),
    supported_mime_types: z.array(z.string()).optional(), // null = all types
  }).strict().default({ enabled: false }),

  obsidian: z.object({
    enabled: z.boolean().default(false),
    vault_path: z.string().optional(), // or env: OBSIDIAN_VAULT_PATH
    sync_interval_seconds: z.number().default(30),
    include_paths: z.array(z.string()).default([]),
    exclude_paths: z.array(z.string()).default(['.obsidian/', 'Templates/']),
    watch_mode: z.enum(['polling', 'inotify']).default('polling'),
  }).strict().default({ enabled: false }),

  local_fs: z.object({
    enabled: z.boolean().default(false),
    paths: z.array(z.string()).default([]),
    recursive: z.boolean().default(true),
    follow_symlinks: z.boolean().default(false),
  }).strict().default({ enabled: false }),

  external_drive: z.object({
    enabled: z.boolean().default(false),
    // Requires: local_fs enabled
    auto_detect: z.boolean().default(true),
  }).strict().default({ enabled: false }),
}).strict();

const WorkersSchema = z.object({
  scan: z.object({
    enabled: z.boolean().default(true),
    concurrency: z.number().min(1).max(10).default(2),
    retry_attempts: z.number().default(3),
    retry_delay_ms: z.number().default(5000),
  }).strict().default({}),

  embed: z.object({
    enabled: z.boolean().default(true),
    // Requires: embedding provider != disabled
    // Impact if disabled: files indexed without embeddings, semantic search unavailable
    concurrency: z.number().min(1).max(8).default(2),
    batch_size: z.number().default(10),
    chunk_size: z.number().default(512),
    chunk_overlap: z.number().default(50),
  }).strict().default({}),

  dedup: z.object({
    enabled: z.boolean().default(true),
    exact: z.object({ enabled: z.boolean().default(true) }).strict().default({}),
    semantic: z.object({
      enabled: z.boolean().default(true),
      threshold: z.number().min(0).max(1).default(0.95),
      // Requires: embedding provider != disabled
    }).strict().default({}),
    image_phash: z.object({
      enabled: z.boolean().default(true),
      hamming_threshold: z.number().default(10),
    }).strict().default({}),
  }).strict().default({}),

  graph: z.object({
    enabled: z.boolean().default(true),
    // Requires: graph module enabled + Neo4j
  }).strict().default({}),

  junk_detector: z.object({
    enabled: z.boolean().default(true),
    ml_classification: z.object({
      enabled: z.boolean().default(false),
      // Requires: LLM provider enabled
    }).strict().default({ enabled: false }),
    rule_based: z.object({ enabled: z.boolean().default(true) }).strict().default({}),
  }).strict().default({}),

  transcription: z.object({
    enabled: z.boolean().default(false),
    provider: z.enum(['whisper', 'groq', 'deepgram']).default('whisper'),
    // Requires: voice-app service running
  }).strict().default({ enabled: false }),
}).strict();

const ObservabilitySchema = z.object({
  enabled: z.boolean().default(true),
  otel: z.object({
    enabled: z.boolean().default(true),
    endpoint: z.string().default('http://otel-collector:4317'),
    protocol: z.enum(['grpc', 'http']).default('grpc'),
    sampling_ratio: z.number().min(0).max(1).default(1.0),
  }).strict().default({}),
  metrics: z.object({ enabled: z.boolean().default(true) }).strict().default({}),
  tracing: z.object({ enabled: z.boolean().default(true) }).strict().default({}),
  logging: z.object({
    enabled: z.boolean().default(true),
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    format: z.enum(['json', 'pretty']).default('json'),
  }).strict().default({}),
}).strict();

const AgentsSchema = z.object({
  enabled: z.boolean().default(true),
  acp: z.object({
    enabled: z.boolean().default(true),
    // ACP server for IDE integration (Zed, Cursor)
    bind: z.string().default('127.0.0.1:9001'),
    auth: z.enum(['none', 'api-key']).default('api-key'),
  }).strict().default({}),
  orchestrator: z.object({
    enabled: z.boolean().default(true),
    model: z.string().default('ollama/llama3.2:3b'),
    // Model aliases (OpenClaw pattern):
    // 'opus' → 'anthropic/claude-opus-4-6'
    // 'sonnet' → 'anthropic/claude-sonnet-4-6'
    max_parallel_agents: z.number().default(3),
  }).strict().default({}),
  search_agent: z.object({ enabled: z.boolean().default(true) }).strict().default({}),
  graph_agent: z.object({
    enabled: z.boolean().default(true),
    // Auto-disabled if graph.enabled = false
  }).strict().default({}),
  rag_agent: z.object({
    enabled: z.boolean().default(true),
    // Auto-disabled if rag.enabled = false
  }).strict().default({}),
  sync_agent: z.object({ enabled: z.boolean().default(true) }).strict().default({}),
}).strict();

// ── Root Config ────────────────────────────────────────────────

export const KMSConfigSchema = z.object({
  version: z.string().default('1.0'),

  // LLM providers
  embedding: EmbeddingProviderSchema.default({ provider: 'ollama', enabled: true }),
  llm: LLMProviderSchema.default({ provider: 'ollama', enabled: true }),

  // Feature modules
  search: SearchModuleSchema.default({}),
  graph: GraphModuleSchema.default({}),
  rag: RAGModuleSchema.default({}),

  // Data sources
  connectors: ConnectorsSchema.default({}),

  // Background workers
  workers: WorkersSchema.default({}),

  // Agents
  agents: AgentsSchema.default({}),

  // Observability
  observability: ObservabilitySchema.default({}),

  // Queue config
  queue: z.object({
    provider: z.enum(['rabbitmq', 'bullmq']).default('rabbitmq'),
    url: z.string().optional(), // or env: RABBITMQ_URL
    prefetch: z.number().default(1),
  }).strict().default({}),

  // Storage config
  storage: z.object({
    provider: z.enum(['minio', 'local', 's3']).default('minio'),
    endpoint: z.string().optional(), // or env: MINIO_ENDPOINT
  }).strict().default({}),

}).strict(); // reject unknown keys

export type KMSConfig = z.infer<typeof KMSConfigSchema>;
```

---

## Example Configurations

### Minimal — No LLM, No Graph (keyword search only)

```json
{
  "version": "1.0",
  "embedding": { "provider": "disabled", "enabled": false },
  "llm": { "provider": "disabled", "enabled": false },
  "search": {
    "enabled": true,
    "keyword": { "enabled": true },
    "semantic": { "enabled": false },
    "hybrid": { "enabled": false }
  },
  "graph": { "enabled": false },
  "rag": { "enabled": false },
  "workers": {
    "embed": { "enabled": false },
    "graph": { "enabled": false }
  },
  "agents": {
    "rag_agent": { "enabled": false },
    "graph_agent": { "enabled": false }
  },
  "connectors": {
    "google_drive": { "enabled": true }
  }
}
```

**Impact summary**: `[INFO] Semantic search disabled (no embedding provider). RAG chat disabled. Graph view disabled. Keyword search active.`

---

### Standard — Ollama local (recommended for most users)

```json
{
  "version": "1.0",
  "embedding": {
    "provider": "ollama",
    "enabled": true,
    "model": "nomic-embed-text"
  },
  "llm": {
    "provider": "ollama",
    "enabled": true,
    "model": "llama3.2:3b"
  },
  "connectors": {
    "google_drive": { "enabled": true },
    "obsidian": {
      "enabled": true,
      "vault_path": "/vault"
    }
  }
}
```

---

### Premium — OpenRouter (cloud LLMs)

```json
{
  "version": "1.0",
  "embedding": {
    "provider": "openai",
    "enabled": true,
    "model": "text-embedding-3-small"
  },
  "llm": {
    "provider": "openrouter",
    "enabled": true,
    "model": "anthropic/claude-sonnet-4-6"
  },
  "rag": {
    "graph_aware": { "enabled": true },
    "streaming": { "enabled": true }
  }
}
```

---

## Feature Impact Graph

When a feature is disabled, this graph surfaces impacts at startup:

```
embedding.disabled
  └─► search.semantic.disabled (auto)
  └─► search.hybrid.disabled (auto)
  └─► workers.embed.disabled (auto)
  └─► workers.dedup.semantic.disabled (auto)
  └─► rag.disabled (auto) ← requires embedding
  └─► agents.rag_agent.disabled (auto)
  └─► agents.graph_agent degraded (no semantic context)

graph.disabled
  └─► workers.graph.disabled (auto)
  └─► rag.graph_aware.disabled (auto)
  └─► agents.graph_agent.disabled (auto)
  └─► search: no traversal queries (graceful degradation)

llm.disabled
  └─► rag.disabled (auto)
  └─► agents.rag_agent.disabled (auto)
  └─► workers.junk_detector.ml_classification.disabled (auto)
  └─► graph.entity_extraction → falls back to spacy (if enabled)

connectors.google_drive.disabled
  └─► No Google Drive files scanned (other sources unaffected)

connectors.obsidian.disabled
  └─► No vault sync (other sources unaffected)
  └─► obsidian-sync worker idles

workers.transcription.disabled
  └─► Audio/video files indexed without transcription text
  └─► Audio content not searchable
```

**Startup output example:**
```
[KMS Config] Loaded: ./.kms/config.json
[KMS Config] Active features:
  ✅ keyword search (PostgreSQL FTS)
  ✅ Google Drive connector
  ✅ Exact deduplication (SHA-256)
  ✅ Rule-based junk detection
  ⚠️  semantic search DISABLED (embedding provider = disabled)
  ⚠️  RAG chat DISABLED (requires embedding provider)
  ⚠️  Knowledge graph DISABLED (graph.enabled = false)
  ℹ️  obsidian connector disabled (set connectors.obsidian.enabled = true to activate)
```

---

## Config Service Implementation

### NestJS Config Module (`kms-api`)

```typescript
// src/config/kms-config.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadKmsConfig],
      validationSchema: KMSConfigSchema,     // Zod validation
      validationOptions: { abortEarly: false },
    }),
  ],
})
export class KmsConfigModule {}

// src/config/config.loader.ts
export async function loadKmsConfig(): Promise<KMSConfig> {
  const hierarchy = [
    '/etc/kms/config.json',           // system
    path.join(homedir(), '.kms/config.json'), // user
    './.kms/config.json',              // project
    './.kms/config.local.json',        // local override
  ];

  let merged = {};
  for (const file of hierarchy) {
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf-8'));
      merged = jsonMergePatch(merged, raw);  // RFC 7396
    }
  }

  // Validate and apply defaults
  const result = KMSConfigSchema.safeParse(merged);
  if (!result.success) {
    throw new ConfigValidationError(result.error.format());
  }

  // Compute derived flags (impact propagation)
  return resolveImpacts(result.data);
}

// Auto-resolve dependent flags
function resolveImpacts(config: KMSConfig): KMSConfig {
  if (config.embedding.provider === 'disabled' || !config.embedding.enabled) {
    config.search.semantic.enabled = false;
    config.search.hybrid.enabled = false;
    config.workers.embed.enabled = false;
    config.workers.dedup.semantic.enabled = false;
    config.rag.enabled = false;
  }
  if (!config.graph.enabled) {
    config.workers.graph.enabled = false;
    config.rag.graph_aware.enabled = false;
    config.agents.graph_agent.enabled = false;
  }
  if (config.llm.provider === 'disabled' || !config.llm.enabled) {
    config.rag.enabled = false;
    config.agents.rag_agent.enabled = false;
    config.workers.junk_detector.ml_classification.enabled = false;
  }
  return config;
}
```

### Python Config Client (`workers`)

```python
# packages/kms-config-py/kms_config/loader.py
from pydantic import BaseModel
import httpx

class KMSConfig(BaseModel):
    """Mirrors the TypeScript schema — validated via Pydantic."""
    embedding: EmbeddingConfig
    llm: LLMConfig
    search: SearchConfig
    graph: GraphConfig
    rag: RAGConfig
    connectors: ConnectorsConfig
    workers: WorkersConfig
    agents: AgentsConfig
    observability: ObservabilityConfig

async def load_config(kms_api_url: str, api_key: str) -> KMSConfig:
    """
    Workers fetch resolved config from kms-api.
    This ensures a single source of truth — workers don't read files directly.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{kms_api_url}/api/v1/config",
            headers={"X-API-Key": api_key},
        )
        resp.raise_for_status()
        return KMSConfig.model_validate(resp.json()["data"])
```

---

## ACP Capability Declaration

Following the `claude-agent-acp` pattern — agents declare capabilities at handshake:

```typescript
// src/modules/agents/acp/acp-server.ts
async initialize(clientCapabilities: AcpClientCapabilities) {
  const cfg = this.configService.get<KMSConfig>('kms');

  return {
    protocolVersion: 1,
    agentCapabilities: {
      search: {
        keyword: cfg.search.keyword.enabled,
        semantic: cfg.search.semantic.enabled,
        hybrid: cfg.search.hybrid.enabled,
      },
      graph: {
        traversal: cfg.graph.enabled && cfg.graph.traversal.enabled,
        community: cfg.graph.enabled && cfg.graph.community_detection.enabled,
        pathFinding: cfg.graph.enabled,
      },
      rag: {
        enabled: cfg.rag.enabled,
        streaming: cfg.rag.enabled && cfg.rag.streaming.enabled,
        graphAware: cfg.rag.enabled && cfg.rag.graph_aware.enabled,
        citations: cfg.rag.enabled && cfg.rag.citations.enabled,
      },
      connectors: {
        googleDrive: cfg.connectors.google_drive.enabled,
        obsidian: cfg.connectors.obsidian.enabled,
        localFs: cfg.connectors.local_fs.enabled,
      },
      // Following ACP adapter pattern — stdout reserved for protocol messages
      // All logs go to stderr
    },
  };
}
```

---

## Config API Endpoint

```
GET  /api/v1/config          → Full resolved config (sensitive fields redacted)
GET  /api/v1/config/features → Feature flag summary (what's enabled/disabled)
GET  /api/v1/config/impacts  → Impact graph (what disabling X breaks)
POST /api/v1/config/validate → Validate a config JSON without applying it
```

**Response example (`/api/v1/config/features`):**

```json
{
  "success": true,
  "data": {
    "features": {
      "search.keyword": { "enabled": true, "reason": null },
      "search.semantic": { "enabled": false, "reason": "embedding provider is disabled" },
      "search.hybrid": { "enabled": false, "reason": "semantic search is disabled" },
      "graph": { "enabled": true, "reason": null },
      "rag": { "enabled": false, "reason": "LLM provider is disabled" },
      "connectors.google_drive": { "enabled": true, "reason": null },
      "connectors.obsidian": { "enabled": false, "reason": "not configured" }
    },
    "warnings": [
      "Semantic search disabled — set embedding.provider to 'ollama' or 'openai' to enable",
      "RAG chat disabled — set llm.provider to 'ollama' or 'openrouter' to enable"
    ]
  }
}
```
