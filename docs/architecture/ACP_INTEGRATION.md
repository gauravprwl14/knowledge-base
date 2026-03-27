# ACP (Agent Client Protocol) Integration

**Version**: 1.0
**Date**: 2026-03-17
**References**:
- agentcommunicationprotocol.dev (REST-based multi-agent ACP)
- github.com/zed-industries/claude-agent-acp (Editor ACP adapter pattern)
- github.com/openclaw/openclaw (Capability registry pattern)

---

## Two ACP Protocols — Clarified

| Protocol | Purpose | Transport | Reference |
|----------|---------|-----------|-----------|
| **ACP (multi-agent)** | Agent-to-agent communication, orchestration | REST + SSE | agentcommunicationprotocol.dev |
| **ACP (editor)** | IDE ↔ coding agent | JSON-RPC / stdio | zed-industries/claude-agent-acp |

This system implements **both**:
- Multi-agent ACP for orchestrating SearchAgent, GraphAgent, RAGAgent
- Editor ACP (via adapter) for Zed/Cursor IDE integration

---

## Multi-Agent ACP Architecture

### Agent Registry

Inspired by OpenClaw's `NodeRegistry`, all agents self-register with a capability declaration:

```typescript
// src/modules/agents/registry/agent-registry.service.ts

export interface AgentCapabilities {
  id: string;
  displayName: string;
  version: string;
  capabilities: string[];            // OpenClaw-style capability identifiers
  inputContentTypes: string[];       // MIME types accepted
  outputContentTypes: string[];      // MIME types produced
  streaming: boolean;
  async: boolean;
  maxConcurrency: number;
  health: 'healthy' | 'degraded' | 'unavailable';
  degradationReason?: string;        // If degraded/unavailable, why
}

// Example: RAGAgent at startup
const ragAgentCaps: AgentCapabilities = {
  id: 'rag-agent',
  displayName: 'RAG Question Answering Agent',
  version: '1.0.0',
  capabilities: [
    'rag.answer',          // Answer questions from knowledge base
    'rag.stream',          // Stream answers via SSE
    'rag.citations',       // Return source citations
    'rag.graph-context',   // Use graph to enrich context (if graph enabled)
    'rag.memory',          // Maintain conversation history
  ],
  inputContentTypes: ['text/plain', 'application/json'],
  outputContentTypes: ['text/plain', 'text/event-stream'],
  streaming: true,
  async: false,
  maxConcurrency: 10,
  health: ragEnabled ? 'healthy' : 'unavailable',
  degradationReason: ragEnabled ? undefined : 'RAG disabled in config (llm.enabled=false)',
};
```

---

## ACP API Endpoints (Multi-Agent)

```
# Agent discovery
GET  /api/v1/agents                         → List all registered agents + capabilities
GET  /api/v1/agents/{agent_id}              → Describe specific agent capabilities

# Agent execution
POST /api/v1/agents/{agent_id}/runs         → Start a run (sync or async)
GET  /api/v1/agents/{agent_id}/runs/{run_id} → Get run status/result
GET  /api/v1/agents/{agent_id}/runs/{run_id}/stream → SSE stream of run output
DELETE /api/v1/agents/{agent_id}/runs/{run_id} → Cancel a run
```

### ACP Message Format (from spec)

```typescript
// POST /api/v1/agents/rag-agent/runs
interface ACPRunRequest {
  input: Array<{
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
  }>;
  stream?: boolean;                  // SSE streaming
  session_id?: string;              // For conversation continuity
  config?: {
    model?: string;                  // Override default model
    max_tokens?: number;
    temperature?: number;
  };
  context?: {
    files?: string[];               // File IDs to include as context
    graph_nodes?: string[];         // Graph node IDs
  };
}

// Response (non-streaming)
interface ACPRunResponse {
  run_id: string;
  status: 'completed' | 'failed' | 'running' | 'cancelled';
  output: Array<{
    role: 'assistant';
    content: string | ContentBlock[];
  }>;
  metadata: {
    model: string;
    tokens_used: number;
    duration_ms: number;
    citations?: Citation[];
    graph_nodes_traversed?: number;
  };
}
```

---

## OrchestratorAgent — Routing Logic

```typescript
// src/modules/agents/orchestrator/orchestrator.service.ts

@Injectable()
export class OrchestratorService {
  constructor(
    private registry: AgentRegistryService,
    private config: ConfigService,
  ) {}

  /**
   * Classify intent and route to appropriate agent(s).
   * Parallelizes search + graph when both are healthy.
   */
  async route(request: ACPRunRequest): Promise<ACPRunResponse> {
    const intent = await this.classifyIntent(request.input);

    // Check available agents
    const available = this.registry.getHealthyAgents();

    switch (intent.type) {
      case 'search':
        return this.runAgent('search-agent', request);

      case 'question':
        if (!available.has('rag-agent')) {
          // Graceful degradation: answer with search results
          return this.runAgentWithFallback('rag-agent', 'search-agent', request);
        }
        // Parallel: search + graph traversal → merge context → RAG
        const [searchCtx, graphCtx] = await Promise.allSettled([
          this.runAgent('search-agent', { ...request, stream: false }),
          available.has('graph-agent')
            ? this.runAgent('graph-agent', { ...request, stream: false })
            : Promise.resolve(null),
        ]);
        return this.runAgent('rag-agent', {
          ...request,
          context: {
            search_results: searchCtx.status === 'fulfilled' ? searchCtx.value : null,
            graph_context: graphCtx.status === 'fulfilled' ? graphCtx.value : null,
          },
        });

      case 'graph_navigate':
        if (!available.has('graph-agent')) {
          return this.errorResponse('Graph agent unavailable — graph module disabled in config');
        }
        return this.runAgent('graph-agent', request);

      case 'sync':
        return this.runAgent('sync-agent', request);
    }
  }
}
```

---

## Editor ACP Integration (Zed/Cursor)

Following the `@zed-industries/claude-agent-acp` pattern:

```typescript
// src/modules/agents/acp/editor-acp-server.ts
// Stdout: ACP protocol messages only
// Stderr: all logs (CRITICAL — same as claude-agent-acp constraint)

export class EditorACPServer {

  /**
   * Bidirectional capability handshake (from claude-agent-acp pattern).
   * Client sends its capabilities, server responds with its own.
   */
  async initialize(clientCaps: AcpClientCapabilities) {
    const cfg = this.config.get<KMSConfig>('kms');

    return {
      protocolVersion: 1,
      agentCapabilities: {
        // Tool capabilities exposed to the IDE
        tools: this.buildToolList(cfg),
        // Session management
        sessionCapabilities: {
          fork: {},
          list: {},
          resume: {},
          close: {},
        },
        // Content types
        promptCapabilities: {
          image: true,
          embeddedContext: true,
        },
        // MCP servers
        mcpCapabilities: {
          http: true,
          sse: true,
        },
      },
    };
  }

  private buildToolList(cfg: KMSConfig): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    // Always available
    tools.push({
      name: 'search',
      description: 'Search the knowledge base with keyword search',
      inputSchema: SearchToolSchema,
    });

    // Conditional on feature flags
    if (cfg.search.semantic.enabled) {
      tools.push({
        name: 'semantic_search',
        description: 'Find semantically similar content',
        inputSchema: SemanticSearchToolSchema,
      });
    }

    if (cfg.graph.enabled) {
      tools.push({
        name: 'graph_traverse',
        description: 'Traverse the knowledge graph to find connections',
        inputSchema: GraphTraversalToolSchema,
      });
      tools.push({
        name: 'find_path',
        description: 'Find the shortest path between two concepts',
        inputSchema: PathFindingToolSchema,
      });
    }

    if (cfg.rag.enabled) {
      tools.push({
        name: 'ask',
        description: 'Ask a question and get an AI-generated answer with citations',
        inputSchema: RAGToolSchema,
      });
    }

    return tools;
  }
}
```

---

## MCP Tool Exposure (for Claude Code, Cursor, etc.)

The system exposes an MCP server at `/api/v1/mcp` (HTTP SSE transport).

### Available MCP Tools

```typescript
// Tools dynamically registered based on active feature flags

// Always registered:
{
  name: "kms_search",
  description: "Search the Knowledge Base for files, notes, and documents",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      sources: { type: "array", items: { type: "string" } },
      file_types: { type: "array", items: { type: "string" } },
      limit: { type: "number", default: 10 }
    },
    required: ["query"]
  }
}

// Registered if graph.enabled = true:
{
  name: "kms_traverse",
  description: "Traverse the knowledge graph from a file or concept",
  inputSchema: {
    type: "object",
    properties: {
      node_id: { type: "string" },
      depth: { type: "number", default: 3 },
      relation_types: { type: "array" }
    },
    required: ["node_id"]
  }
}

{
  name: "kms_find_path",
  description: "Find the shortest conceptual path between two documents or concepts",
  inputSchema: {
    type: "object",
    properties: {
      from_id: { type: "string" },
      to_id: { type: "string" },
      max_depth: { type: "number", default: 6 }
    },
    required: ["from_id", "to_id"]
  }
}

// Registered if rag.enabled = true:
{
  name: "kms_ask",
  description: "Ask a question and get an answer from the knowledge base with citations",
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string" },
      session_id: { type: "string" },
      context_file_ids: { type: "array", items: { type: "string" } }
    },
    required: ["question"]
  }
}
```

---

## Agent Config Section (in `kms.config.json`)

Following OpenClaw's `agents.list` pattern:

```json
{
  "agents": {
    "enabled": true,
    "acp": {
      "enabled": true,
      "bind": "127.0.0.1:9001",
      "auth": "api-key"
    },
    "orchestrator": {
      "enabled": true,
      "model": "ollama/llama3.2:3b",
      "max_parallel_agents": 3
    },
    "list": [
      {
        "id": "search-agent",
        "enabled": true
      },
      {
        "id": "graph-agent",
        "enabled": true
      },
      {
        "id": "rag-agent",
        "enabled": true,
        "model": "ollama/llama3.2:3b"
      },
      {
        "id": "sync-agent",
        "enabled": true
      }
    ]
  }
}
```
