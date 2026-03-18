---
id: seq-18-sse-acp-streaming
created_at: 2026-03-18T00:00:00Z
content_type: sequence-diagram
status: current
generator_model: claude-sonnet-4-6
---

# Sequence 18: ACP SSE Streaming Flow

## Full sequence diagram:
```mermaid
sequenceDiagram
  participant Browser as Browser\n(React Client Component)
  participant NextJS as Next.js\n(client-side fetch)
  participant Fastify as NestJS/Fastify\n(kms-api :8000)
  participant Redis as Redis\n(session store)
  participant SearchAPI as search-api\n(:8001)
  participant Anthropic as Anthropic\nClaude API

  Note over Browser,Anthropic: Phase 1 — Establish Session (one-time)
  Browser->>NextJS: User opens /chat
  NextJS->>Fastify: POST /api/v1/acp/v1/initialize\n{ protocolVersion: 1 }
  Fastify-->>NextJS: { protocolVersion: 1, agentCapabilities: { tools: [...] } }

  Browser->>NextJS: User types first message → send
  NextJS->>Fastify: POST /api/v1/acp/v1/sessions\nAuthorization: Bearer JWT
  Fastify->>Redis: SET kms:acp:session:{uuid} { userId, createdAt }
  Redis-->>Fastify: OK
  Fastify-->>NextJS: 201 { sessionId: "uuid" }

  Note over Browser,Anthropic: Phase 2 — Prompt + SSE Stream
  NextJS->>Fastify: POST /api/v1/acp/v1/sessions/{id}/prompt\nAccept: text/event-stream\n{ prompt: [{ type: "text", text: "What is BGE-M3?" }] }

  Note over Fastify: @Sse handler runs SYNCHRONOUSLY:\n1. Creates ReplaySubject(100)\n2. Fires async pipeline (no await)\n3. Returns Observable immediately\n\nNestJS subscribes and sets SSE headers:\nContent-Type: text/event-stream\nCache-Control: no-cache\nX-Accel-Buffering: no

  Fastify-->>NextJS: HTTP 200 (headers sent, body streaming)

  Note over Fastify: Async pipeline executes:
  Fastify->>Redis: GET kms:acp:session:{id}
  Redis-->>Fastify: { userId }

  Fastify->>NextJS: data: {"type":"tool_call_start","data":{"tool":"kms_search"}}\n\n
  NextJS->>Browser: Tool call indicator shown

  Fastify->>SearchAPI: POST /search\n{ query, x-user-id }\n(AbortSignal 10s)
  SearchAPI-->>Fastify: { items: [5 results] }

  Fastify->>NextJS: data: {"type":"tool_call_result","data":{"tool":"kms_search","resultCount":5}}\n\n

  Fastify->>Anthropic: messages.create(stream=true)\nsystem: KMS context + 5 search results\nuser: "What is BGE-M3?"

  loop Per text token from Claude
    Anthropic-->>Fastify: delta { type: "content_block_delta", text: "BGE" }
    Fastify->>NextJS: data: {"type":"agent_message_chunk","data":{"text":"BGE"}}\n\n
    NextJS->>Browser: Text appended to ChatMessage
  end

  Anthropic-->>Fastify: message_stop event
  Fastify->>NextJS: data: {"type":"done","data":{}}\n\n
  NextJS->>Browser: Streaming animation stops

  Note over Browser,NextJS: Phase 3 — Cleanup (on unmount)
  Browser->>NextJS: Component unmounts
  NextJS->>Fastify: DELETE /api/v1/acp/v1/sessions/{id}\n(fire and forget)
  Fastify->>Redis: DEL kms:acp:session:{id}
```

## Key Implementation Notes

### Why fetch not EventSource
`EventSource` is browser-native SSE but only supports GET. ACP prompt is POST with JSON body.
Solution: `fetch(POST, { Accept: 'text/event-stream' })` + read `response.body` as `ReadableStream`.

### Why ReplaySubject(100)
NestJS `@Sse` subscribes to the Observable AFTER the handler returns.
The async pipeline starts immediately and may emit events before subscription.
`ReplaySubject(100)` buffers emissions — late subscriber receives all buffered events.

### Proxy buffering
Nginx and other reverse proxies buffer responses by default.
The `X-Accel-Buffering: no` header (set by Fastify `onSend` hook) disables nginx buffering for SSE routes.

### Authentication on SSE endpoint
JWT is validated by the global `JwtAuthGuard` before the `@Sse` handler runs.
The session ID (not the JWT) is used to look up `userId` inside the pipeline.
This means the JWT must be valid but `req.user.id` is not used directly in the SSE handler.
