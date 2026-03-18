# 0019 — ACP Tool Registry Design: Static Declarative Registry

- **Status**: Accepted
- **Date**: 2026-03-17
- **Deciders**: Architecture Team
- **Tags**: [acp, tools, registry, feature-flags]

## Context and Problem Statement

ACP allows an agent to advertise and invoke tools. When an ACP client sends a `tools/list` request, the agent responds with a manifest of available tools (name, description, JSON Schema for parameters). When the client sends `tools/call`, the agent executes the named tool and returns the result.

KMS has five natural tools that correspond directly to existing pipeline capabilities:

| Tool name | Backing service | Feature flag |
|-----------|----------------|-------------|
| `search` | `search-api` hybrid search endpoint | always on |
| `retrieve` | `search-api` + Qdrant point fetch | always on |
| `graph_expand` | `graph-worker` Neo4j traversal | `ENABLE_GRAPH` |
| `embed` | `embed-worker` via AMQP | `ENABLE_EMBEDDING` |
| `ingest` | `kms-api` POST /files → scan-worker pipeline | always on |

The question is how the tool registry — the component that answers `tools/list` and dispatches `tools/call` — should be designed. Specifically: should it be static (tools declared in code, resolved at startup) or dynamic (tools registered at runtime by modules or plugins)?

KMS uses a feature-flag-driven architecture (`.kms/config.json`) where capabilities like graph traversal and embedding are enabled or disabled at deployment time. The tool manifest must reflect this configuration accurately.

## Decision Drivers

- All KMS tools are known at design time — there is no requirement for third-party plugins to contribute tools at runtime
- Feature flags in `.kms/config.json` determine tool availability — this is a deployment-time decision, not a runtime-discovery problem
- Type safety is a hard requirement: tool parameter schemas must be validated against TypeScript/Python types, not constructed from arbitrary plugin objects
- The five tools map 1-to-1 to existing service interfaces already defined in `contracts/openapi.yaml`
- Startup-time validation catches misconfiguration before the service accepts traffic
- `kms-api` is NestJS — a module system already provides structured registration; a secondary plugin registry would duplicate that mechanism

## Considered Options

- **Option A**: Static declarative registry — tools defined as typed classes/schema objects in code, feature-flag gated, list resolved at startup
- **Option B**: Dynamic plugin registry — tools registered at runtime via a `registerAcpTool()` API (similar to `openclaw`'s `registerAcpRuntimeBackend()`), modules self-register when initialised
- **Option C**: OpenAI function calling format — use OpenAI-compatible `functions` / `tools` schema format for broader ecosystem compatibility, tools declared in OpenAI JSON format

## Decision Outcome

Chosen: **Option A — Static declarative registry with feature-flag gating** — the tool set is fixed and known at design time, type safety and startup validation are higher priorities than runtime extensibility, and a static registry aligns directly with KMS's existing feature-flag and NestJS module patterns.

### Consequences

**Good:**
- Tool schemas are TypeScript interfaces (in `kms-api`) and Pydantic models (in `rag-service`) — full compile-time and runtime type checking
- `tools/list` is computed once at application bootstrap by reading `.kms/config.json`; subsequent requests are served from memory — zero per-request overhead
- Startup validation ensures a tool that references a disabled feature flag is excluded from the manifest before the first request arrives
- No plugin API surface to maintain, document, or version — reduces attack surface and onboarding complexity
- The five tools map cleanly to existing `contracts/openapi.yaml` schemas — no new schema language to learn
- Straightforward to test: tool registry state is a pure function of the feature-flag configuration

**Bad / Trade-offs:**
- Adding a new tool requires a code change and redeployment — cannot add tools via configuration alone
- If future requirements call for user-installed or marketplace tools, a migration to a dynamic registry will be needed
- Teams extending KMS must understand the registry source file to add tools, rather than dropping a plugin into a folder

## Pros and Cons of the Options

### Option A — Static declarative registry

- ✅ Full type safety: TypeScript interfaces enforce parameter schema shape at compile time
- ✅ Startup validation: registry build fails fast if a tool references an unavailable service
- ✅ Feature-flag integration is trivial — tool is included in the manifest if and only if its flag is enabled
- ✅ Matches NestJS module pattern: each tool is a provider in `AgentsModule`, no secondary registration mechanism
- ✅ Simple to audit: all available tools are visible in one file
- ✅ No runtime reflection or dynamic schema construction — schemas are exact, predictable
- ❌ New tool requires code change + redeploy
- ❌ Not extensible by external contributors without touching core code

### Option B — Dynamic plugin registry

- ✅ Modules can self-register tools when initialised — decoupled from core agent code
- ✅ Future marketplace or user-installed tools become possible without architectural change
- ✅ Pattern used by `openclaw`'s `registerAcpRuntimeBackend()` — community precedent
- ❌ Schema validation must happen at registration time (runtime) rather than at compile time — late error detection
- ❌ A plugin that registers a tool pointing at a disabled feature will cause a runtime failure rather than a startup failure
- ❌ Introduces a registration API that must be versioned and maintained
- ❌ KMS has no plugin ecosystem and no near-term roadmap item requiring third-party tool injection — YAGNI
- ❌ Increases attack surface: a misconfigured module could inadvertently expose a tool that should be disabled

### Option C — OpenAI function calling format

- ✅ Broad ecosystem compatibility — any OpenAI-compatible client can call KMS tools
- ✅ Large volume of community tooling and examples
- ❌ OpenAI function format is not the ACP wire format — using it would require a translation layer between OpenAI schema and ACP `tools/list` response
- ❌ ACP defines its own JSON Schema-based tool descriptor; diverging from it breaks ACP spec compliance
- ❌ Two schema formats to maintain (ACP-native and OpenAI) if both are needed
- ❌ KMS does not currently target OpenAI-compatible clients — premature generalisation

## Registry Design

The tool registry is implemented as an `AcpToolRegistry` provider inside `kms-api`'s `AgentsModule`. At module initialisation it reads feature flags and constructs the manifest:

```typescript
// acp-tool-registry.provider.ts
export const KMS_ACP_TOOLS: AcpToolDefinition[] = [
  {
    name: 'search',
    description: 'Hybrid semantic + keyword search over the knowledge base.',
    inputSchema: SearchToolInputSchema,   // Zod schema → JSON Schema
    always: true,
  },
  {
    name: 'retrieve',
    description: 'Fetch full document chunks by ID.',
    inputSchema: RetrieveToolInputSchema,
    always: true,
  },
  {
    name: 'graph_expand',
    description: 'Expand a concept node in the knowledge graph.',
    inputSchema: GraphExpandToolInputSchema,
    featureFlag: 'ENABLE_GRAPH',
  },
  {
    name: 'embed',
    description: 'Generate BGE-M3 embeddings for a text passage.',
    inputSchema: EmbedToolInputSchema,
    featureFlag: 'ENABLE_EMBEDDING',
  },
  {
    name: 'ingest',
    description: 'Ingest a new file into the knowledge base pipeline.',
    inputSchema: IngestToolInputSchema,
    always: true,
  },
];
```

The `AcpToolRegistry` filters this list against the loaded feature flags and caches the result. The `tools/list` JSON-RPC handler reads from the cache. The `tools/call` dispatcher looks up the tool by name and delegates to the appropriate backing service method.

Feature-flag gating example at startup:

```typescript
// acp-tool-registry.ts
@Injectable()
export class AcpToolRegistry implements OnModuleInit {
  private manifest: AcpToolDefinition[] = [];

  constructor(private readonly featureFlags: FeatureFlagsService) {}

  onModuleInit(): void {
    this.manifest = KMS_ACP_TOOLS.filter(
      tool => tool.always || this.featureFlags.isEnabled(tool.featureFlag!),
    );
    this.logger.log(
      { tools: this.manifest.map(t => t.name) },
      'ACP tool registry initialised',
    );
  }

  list(): AcpToolDefinition[] {
    return this.manifest;
  }
}
```

All tool input and output types are defined in `packages/@kb/contracts` so that both `kms-api` (TypeScript) and `rag-service` (Python, via generated Pydantic models) share the same schema source of truth.
