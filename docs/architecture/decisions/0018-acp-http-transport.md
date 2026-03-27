# 0018 — ACP Transport Selection: HTTP Streamable over Stdio

- **Status**: Accepted
- **Date**: 2026-03-17
- **Deciders**: Architecture Team
- **Tags**: [acp, protocol, transport, streaming]

## Context and Problem Statement

The Agent Client Protocol (ACP) specifies JSON-RPC 2.0 over NDJSON and defines two transports for connecting a client to an agent:

1. **Stdio transport** (primary in the ACP spec): the client spawns the agent as a subprocess and exchanges messages over stdin/stdout.
2. **Streamable HTTP transport** (secondary/draft): the agent is a persistent HTTP server; the client sends JSON-RPC requests over HTTP and receives responses or streamed output via Server-Sent Events.

KMS is a containerized web service. `kms-api` (NestJS/Fastify) is an HTTP server running inside Docker. `rag-service` (Python FastAPI) is a separate container reachable only via the Docker internal network. Neither service has the ability to fork a subprocess that represents the other. Additionally, KMS already streams token-by-token output from `rag-service` to the browser using SSE (established in ADR-0012 and ADR-0013).

We need to select which ACP transport KMS will implement when exposing agent capabilities externally (e.g., to ACP-compatible clients such as Zed editor or future Claude Desktop integrations).

## Decision Drivers

- KMS services are Docker containers — no process forking across service boundaries in production
- Existing SSE streaming infrastructure already in place (`GET /runs/{id}/stream` in `rag-service`)
- All inter-service communication in KMS is HTTP (see ADR-0013 architecture diagram)
- Redis is used for session state; run state is already stored as `kms:rag:run:{run_id}` keys
- The HTTP transport maps directly to the existing run-lifecycle REST contract (ADR-0012) with minimal adapter code
- No new operational primitives should be required (no subprocess lifecycle management, no named pipes, no OS-level IPC)

## Considered Options

- **Option A**: Stdio transport — spawn agent as subprocess, exchange JSON-RPC 2.0 over stdin/stdout (NDJSON framing)
- **Option B**: HTTP streamable transport — agent as HTTP server, JSON-RPC 2.0 request over POST, SSE stream for responses
- **Option C**: WebSocket transport — custom bidirectional socket, not in the ACP specification

## Decision Outcome

Chosen: **Option B — HTTP streamable transport** — it is the only transport that is compatible with KMS's containerized architecture, matches the existing SSE streaming pattern, and requires no new operational infrastructure.

### Consequences

**Good:**
- No subprocess management: `rag-service` is already a long-running HTTP server; the ACP adapter is a thin layer on top of the existing `/runs` endpoints
- SSE already implemented and battle-tested for chat streaming (ADR-0012); ACP response streaming reuses the same mechanism
- Containerization-friendly: the transport is pure HTTP, crossing network boundaries cleanly via the Docker internal network
- ACP-compatible external clients (Zed, Claude Desktop) can connect to `kms-api`'s ACP endpoint over HTTP without any special environment setup
- W3C `traceparent` propagation continues to work unchanged — OTel spans cross the HTTP boundary as they do today
- Aligns with the "thin proxy" role of `kms-api`: ACP HTTP calls are proxied to `rag-service` the same way chat runs are

**Bad / Trade-offs:**
- The HTTP streamable transport is marked secondary/draft in the ACP specification; the spec may evolve before it stabilises
- Stdio transport is the reference implementation path used by `openclaw/acpx` — community examples and tooling are primarily written for stdio; HTTP transport examples are scarcer
- An additional HTTP roundtrip exists compared to stdio (client → `kms-api` → `rag-service`), adding ~2–5 ms latency per request on the Docker internal network

## Pros and Cons of the Options

### Option A — Stdio transport

- ✅ Primary transport in the ACP spec; most reference implementations target it
- ✅ Zero network overhead — messages go over pipe, not TCP
- ✅ Well-supported in `@agentclientprotocol/sdk` and Python ACP SDKs
- ❌ Requires the client to spawn the agent as a child process — impossible when the agent is a remote Docker container
- ❌ No equivalent to forking `rag-service` from inside `kms-api` at request time in a multi-replica production environment
- ❌ Would require a per-request ephemeral subprocess: resource-intensive, not horizontally scalable
- ❌ stdin/stdout are not accessible across Docker network boundaries without tunneling (e.g., `socat`, SSH), which adds unacceptable operational complexity

### Option B — HTTP streamable transport

- ✅ Agent is a persistent HTTP server — matches KMS's existing deployment model exactly
- ✅ SSE streaming for token output is already implemented in `rag-service` (`text/event-stream`)
- ✅ Scales horizontally with load balancer in front of `rag-service` replicas
- ✅ Stateless transport layer — session state lives in Redis, not in the transport connection
- ✅ Compatible with standard HTTP tooling: `curl`, Postman, OTel HTTP instrumentation
- ❌ HTTP streamable transport is a draft extension in ACP; the spec is less stable than stdio
- ❌ Requires CORS and auth middleware to be applied to ACP endpoints (acceptable — already done for existing endpoints)

### Option C — WebSocket transport

- ✅ Bidirectional, low-latency after handshake
- ❌ Not part of the ACP specification — would require a custom client-side SDK adapter
- ❌ Adds a new connection type to operate and monitor
- ❌ NestJS/Fastify WebSocket gateway is a separate module from the HTTP gateway — increases surface area
- ❌ No benefit over SSE for the current use case (server pushes tokens; client sends one request)

## Implementation Notes

The ACP HTTP endpoint will be exposed by `kms-api` at `POST /acp/v1` (JSON-RPC 2.0 envelope). The `AgentsModule` in `kms-api` will translate ACP `run` method calls into the existing run-lifecycle REST calls to `rag-service` (ADR-0012). SSE streams from `rag-service` will be re-emitted as ACP `StreamChunk` notifications on the same SSE connection held open to the ACP client.

```
ACP Client ──POST /acp/v1──► kms-api AgentsModule (ACP adapter)
                                    │  POST /runs (run-lifecycle, ADR-0012)
                                    ▼
                             rag-service FastAPI
                                    │  SSE /runs/{id}/stream
                                    ▼
                             kms-api (re-emit as ACP StreamChunk SSE)
                                    │
                             ACP Client (SSE)
```

Session continuity across multiple ACP requests uses the existing Redis `kms:rag:run:{run_id}` key with the 10-minute TTL established in ADR-0012.
