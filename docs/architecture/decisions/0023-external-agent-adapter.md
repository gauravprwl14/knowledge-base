# 0023 — External Agent Adapter Pattern

- **Status**: Proposed
- **Date**: 2026-03-17
- **Deciders**: KMS Team
- **Tags**: [acp, external-agents, claude, transport, adapter]

## Context and Problem Statement

KMS needs to connect to external ACP-compatible agents — Claude Code, Codex, Gemini, and direct Anthropic/OpenRouter API endpoints — to ground their responses in private knowledge base context. These external agents use fundamentally different transport mechanisms:

- **Stdio transport**: ACP's primary transport. The agent runs as a subprocess; the host communicates over `stdin`/`stdout`. The `@zed-industries/claude-agent-acp` and `@zed-industries/codex-acp` npm packages are designed specifically for this pattern, matching how Claude Code and Codex operate inside IDEs (Zed, Cursor, VS Code).
- **HTTP transport**: ACP's secondary transport (streamable HTTP). Natural for cloud-hosted APIs (Anthropic API, OpenRouter, custom ACP servers). No subprocess lifecycle to manage.

KMS runs inside Docker containers. Subprocess spawning in a containerised environment is technically possible but introduces process lifecycle complexity: the child process inherits the container's resource constraints, orphaned processes must be reaped by the NestJS service, and health checking a subprocess differs from health checking an HTTP endpoint.

The question is: should KMS standardise on a single transport (stdio or HTTP) or support both? And if both, how should the transport selection be abstracted so that the rest of the system — WorkflowEngine, RAG pipeline, MCP server — does not need to know which transport a given agent uses?

This decision builds on ADR-0020 (agent registry) and ADR-0021 (workflow engine). All external agent interactions are initiated by the WorkflowEngine and tracked in run state. This decision does not change those patterns — it defines only how the transport layer below the WorkflowEngine is implemented.

## Decision Drivers

- Claude Code's official ACP adapter is designed as a stdio subprocess — forcing it into an HTTP wrapper would require maintaining a custom shim not aligned with the upstream package design
- Cloud-hosted agents (Anthropic API, OpenRouter, future custom ACP servers) are HTTP-native — requiring them to be wrapped as subprocesses would add unnecessary operational overhead
- The WorkflowEngine and RAG pipeline must be decoupled from transport details — they should call a single interface regardless of whether the underlying agent is a subprocess or an HTTP endpoint
- Process lifecycle management for stdio agents (spawn, health-check, reap, pool) must be isolated from business logic
- A single proxy/sidecar (Option 4) adds an independent failure domain and deployment complexity that is not justified at current scale
- The external agent registry (ADR-0020) must be the sole source of truth for which transport a given agent ID uses — the adapter type is a config-time decision, not a runtime parameter

## Considered Options

- **Option 1**: Stdio-only — spawn all external agents as subprocesses; use `@zed-industries/claude-agent-acp` for Claude and `@zed-industries/codex-acp` for Codex; manage a process pool for concurrent sessions
- **Option 2**: HTTP-only — require all external agents to expose ACP-over-HTTP; build a custom HTTP wrapper around the Anthropic API that implements the ACP protocol envelope
- **Option 3**: Dual-adapter pattern — `StdioAcpAdapter` for subprocess-based agents + `HttpAcpAdapter` for HTTP endpoints; an `ExternalAgentAdapterFactory` selects the right adapter at session creation time based on the registry entry; both implement `IExternalAgentAdapter`
- **Option 4**: Proxy sidecar service — a dedicated sidecar (modelled on openclaw's Gateway) manages all external agent connections and exposes a unified WebSocket/HTTP interface to `kms-api`

## Decision Outcome

Chosen: **Option 3 — Dual-adapter pattern**.

- `StdioAcpAdapter` handles: `claude-code` (`npx -y @zed-industries/claude-agent-acp`), `codex` (`npx @zed-industries/codex-acp`), `gemini` (CLI subprocess), `kimi` (CLI subprocess)
- `HttpAcpAdapter` handles: `claude-api` (Anthropic API wrapped in ACP protocol envelope), `custom-acp` (any ACP-over-HTTP endpoint), future OpenRouter integration
- Both adapters implement the `IExternalAgentAdapter` interface: `ensureSession()`, `sendPrompt()`, `streamEvents()`, `cancel()`, `close()`, `healthCheck()`
- `ExternalAgentAdapterFactory` is injected into `WorkflowEngine` and `AgentOrchestrator`; it resolves the adapter from the registry entry's `transport` field (`"stdio"` | `"http"`)
- Process pool: maximum **3 concurrent stdio subprocess sessions per user**; HTTP adapters are stateless and not pool-limited at the adapter layer (rate limits are enforced upstream)
- Option 4 (proxy sidecar) is deferred — the operational overhead is not justified until multi-tenant scale requires centralised connection management; this ADR will be superseded when that threshold is reached

### Consequences

**Good:**
- The WorkflowEngine and RAG pipeline call a single `IExternalAgentAdapter` interface — transport is invisible to all orchestration logic
- Stdio agents use their upstream-maintained ACP adapter packages (`@zed-industries/claude-agent-acp`) without any custom shim — drift from upstream is minimised
- HTTP agents avoid subprocess overhead entirely — `HttpAcpAdapter` is a thin Axios/fetch wrapper with retry and stream parsing
- The process pool cap (3 per user) provides a hard bound on subprocess proliferation without requiring a sidecar
- Adding a new external agent requires only a registry entry change (`transport: "stdio"` + `command`) or (`transport: "http"` + `baseUrl`) — no new adapter code for standard cases
- `healthCheck()` has transport-specific implementations: stdio checks process liveness; HTTP does a GET to a `/health` or capability endpoint

**Bad / Trade-offs:**
- `StdioAcpAdapter` must implement subprocess lifecycle management (spawn, stdin/stdout framing, stderr capture, SIGTERM on cancel, process reaping) — this is non-trivial code that has no equivalent in the HTTP adapter
- Stdio subprocess sessions are stateful and consume OS-level resources (file descriptors, process slots) for their entire duration — they cannot be pooled across users the way HTTP connections can
- Debugging stdio transport requires capturing subprocess stderr and correlating it with the parent NestJS trace — OTel span propagation across the stdio boundary requires explicit trace context injection into the subprocess environment
- The 3-subprocess-per-user cap is a heuristic; it may need tuning once real usage patterns are observed

## Pros and Cons of the Options

### Option 1 — Stdio-only

- ✅ Consistent transport for all agents — one adapter implementation to maintain
- ✅ Works correctly for Claude Code and Codex, which are designed as subprocess ACP adapters
- ✅ No HTTP client configuration required — all communication is local process I/O
- ❌ Cloud APIs (Anthropic, OpenRouter) are HTTP-native; wrapping them as subprocesses is artificial and adds latency for subprocess startup on every session
- ❌ Process pool management at scale is complex — Docker container process limits must be accounted for
- ❌ A subprocess crash takes the session with it; HTTP adapters can retry transparently

### Option 2 — HTTP-only

- ✅ Stateless transport — HTTP adapters are easy to retry, pool, and health-check
- ✅ No subprocess lifecycle code — simpler adapter implementation
- ✅ Works naturally for cloud-hosted APIs
- ❌ Claude Code's `@zed-industries/claude-agent-acp` package is designed for stdio — forcing it into HTTP requires a custom shim that diverges from upstream and must be maintained
- ❌ Codex and Gemini CLI tools do not natively expose ACP over HTTP — custom HTTP servers would need to be written and kept in sync with CLI updates
- ❌ Eliminates a class of agents (IDE-integrated subprocess agents) that are architecturally important for the KMS use case

### Option 3 — Dual-adapter pattern (chosen)

- ✅ Each agent uses its natural transport — no shims, no artificial wrappers
- ✅ Single interface for all orchestration code — WorkflowEngine is transport-agnostic
- ✅ Upstream adapter packages (`@zed-industries/claude-agent-acp`) used as intended
- ✅ Process pool bounded per user — subprocess proliferation is controlled
- ❌ Two adapter implementations to maintain instead of one
- ❌ Stdio adapter requires non-trivial subprocess lifecycle code
- ❌ OTel trace propagation differs between transports — requires transport-specific span injection logic

### Option 4 — Proxy sidecar service

- ✅ Centralised connection management — all external agent connections go through one service
- ✅ Enables cross-user process pooling and connection reuse at scale
- ✅ The sidecar can be scaled independently of `kms-api`
- ❌ Adds an independent failure domain — the sidecar becomes a critical dependency for all external agent calls
- ❌ Adds operational complexity: a new Docker service, health checks, a new internal API contract
- ❌ At current scale, the overhead is not justified — the dual-adapter pattern achieves equivalent isolation at lower complexity
- ❌ Deferred: reconsider when multi-tenant concurrency exceeds the per-container process pool limits

## The `IExternalAgentAdapter` Interface

```typescript
// kms-api/src/modules/agents/adapters/external-agent-adapter.interface.ts

interface ExternalAgentSessionInput {
  agentId: string;
  userId: string;
  runId: string;
  /** Injected by WorkflowEngine — agents must not supply this directly */
  sessionDepth: number;
  /** Arbitrary metadata passed through to the adapter (e.g. model override, temperature) */
  config?: Record<string, unknown>;
}

interface ExternalAgentHandle {
  sessionId: string;
  agentId: string;
  transport: 'stdio' | 'http';
  /** Opaque adapter-internal reference — StdioAcpAdapter stores ChildProcess; HttpAcpAdapter stores baseUrl */
  internalRef: unknown;
}

interface IExternalAgentAdapter {
  /** Open (or reuse from pool) an ACP session for this agent.
   *  StdioAcpAdapter: spawns subprocess; HttpAcpAdapter: validates endpoint reachability.
   */
  ensureSession(input: ExternalAgentSessionInput): Promise<ExternalAgentHandle>;

  /** Send a prompt and stream back ACP runtime events.
   *  The caller (WorkflowEngine) iterates the AsyncIterable to forward events to SSE.
   */
  sendPrompt(
    handle: ExternalAgentHandle,
    prompt: AcpPromptBlock[],
  ): AsyncIterable<AcpRuntimeEvent>;

  /** Signal the agent to stop the current prompt execution (equivalent to ACP interrupt). */
  cancel(handle: ExternalAgentHandle): Promise<void>;

  /** Terminate the session and release resources (SIGTERM subprocess / close HTTP keepalive). */
  close(handle: ExternalAgentHandle): Promise<void>;

  /** Probe whether the agent is available to accept a new session.
   *  StdioAcpAdapter: checks process pool headroom.
   *  HttpAcpAdapter: GET /health or capability endpoint.
   */
  healthCheck(): Promise<boolean>;
}
```

`ExternalAgentAdapterFactory` selects the implementation:

```typescript
// kms-api/src/modules/agents/adapters/external-agent-adapter.factory.ts

@Injectable()
export class ExternalAgentAdapterFactory {
  constructor(
    private readonly stdioAdapter: StdioAcpAdapter,
    private readonly httpAdapter: HttpAcpAdapter,
    private readonly agentRegistry: AgentRegistryService,
  ) {}

  resolve(agentId: string): IExternalAgentAdapter {
    const entry = this.agentRegistry.getOrThrow(agentId); // throws KBEXT0001 if unknown
    return entry.transport === 'stdio' ? this.stdioAdapter : this.httpAdapter;
  }
}
```

Registry entry shape for external agents:

```typescript
interface ExternalAgentRegistryEntry {
  id: string;             // e.g. "claude-api", "claude-code", "codex"
  transport: 'stdio' | 'http';
  /** stdio only */ command?: string;   // e.g. "npx -y @zed-industries/claude-agent-acp"
  /** http only  */ baseUrl?: string;   // e.g. "https://api.anthropic.com/v1/acp"
  maxConcurrentSessionsPerUser?: number; // defaults: stdio=3, http=unlimited
}
```

Error codes reserved for external agent adapter errors:

| Code | Condition |
|------|-----------|
| `KBEXT0001` | Unknown agent ID — not in registry |
| `KBEXT0002` | Subprocess spawn failed (stdio adapter) |
| `KBEXT0003` | Process pool limit reached for user |
| `KBEXT0004` | HTTP endpoint unreachable |
| `KBEXT0005` | API key missing or invalid |
| `KBEXT0006` | Session closed unexpectedly |
| `KBEXT0007` | Stream parse error (malformed ACP event) |
| `KBEXT0008` | Cancel/interrupt not acknowledged within timeout |
| `KBEXT0009` | MCP feature flag disabled |
| `KBEXT0010` | MCP tool not found |
| `KBEXT0011` | MCP tool input validation failed |
