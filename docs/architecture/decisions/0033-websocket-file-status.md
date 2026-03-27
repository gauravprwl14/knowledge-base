# ADR-0033: WebSocket for File Processing Status Updates

**Date**: 2026-03-27
**Status**: Accepted
**Deciders**: Gaurav (Ved)

---

## Context

When a user opens a file that is still being processed (embedding in progress, transcription running), the UI must show live progress. Three options were considered:

1. **Polling** — frontend calls `GET /files/:id` on an interval (e.g., every 10 seconds)
2. **SSE (Server-Sent Events)** — server pushes updates to the client over a long-lived HTTP connection
3. **WebSocket** — bidirectional full-duplex connection between client and server

---

## Decision

Use **WebSocket** for file processing status, with a **polling fallback** (10s interval) if the WebSocket connection cannot be established.

- Add a WebSocket gateway to `kms-api` (NestJS `@WebSocketGateway`)
- Client hook `useFileStatus(fileId)` opens a WebSocket connection and subscribes to events for the given `fileId`
- Hook returns `{ status, embeddingProgress, transcriptionStatus }` and auto-refreshes the viewer on completion

SSE remains for chat streaming (already in production, unchanged).

---

## Rationale

**Why not polling?**
- Polling at 10s intervals means a user sees stale status for up to 10 seconds. For a file being embedded (which takes 2–30s depending on size), this feels unresponsive.
- Polling generates unnecessary API load when many files are processing simultaneously (N files × N users × 1 request/10s).
- The `ProcessingStatus` composite is a real-time UX feature — polling undermines it.

**Why not SSE for file status?**
- SSE is unidirectional (server → client over HTTP). It works well for AI token streaming because the client sends one request and receives a stream.
- File status is subscription-based: the client wants updates for a specific `fileId`. With SSE, this would require one long-lived HTTP connection per file being viewed — connection pool exhaustion risk.
- SSE cannot be multiplexed easily: a single WebSocket connection can carry events for multiple fileIds.

**Why WebSocket?**
- Bidirectional: the client sends a `subscribe` message with `{ fileId }`, the server sends `progress` events back on the same connection.
- One connection per open drawer/detail page — multiplexed for multiple files if needed.
- NestJS has native WebSocket gateway support with `socket.io` or `ws` — minimal new infrastructure.
- The server can push updates immediately when the embedding worker completes — no polling lag.

**Why SSE for chat and WebSocket for files, not unified on WebSocket?**
- The existing SSE chat implementation is working in production. Rewriting it to WebSocket would be a risky regression for zero new capability.
- SSE is the correct primitive for one-way AI token streaming — it is stateless and HTTP-native.
- WebSocket is the correct primitive for stateful subscriptions like file processing status.
- Two different transports for two different communication patterns is not complexity — it is appropriate tool selection.

---

## Consequences

**Positive:**
- Real-time progress display with < 1s latency from worker event to UI update
- Single WebSocket connection supports multiple active subscriptions
- NestJS gateway is isolated — easy to test and monitor independently

**Negative:**
- Adds a WebSocket gateway to `kms-api` — new infrastructure to configure in Docker Compose and nginx proxy
- WebSocket connections require stickiness if kms-api is scaled horizontally (mitigated with Redis pub/sub)
- Requires graceful fallback (polling) for environments where WebSocket is blocked (some corporate proxies)

---

## Implementation Notes

**NestJS WebSocket gateway:**
```ts
@WebSocketGateway({ namespace: '/files', cors: { origin: '*' } })
export class FileStatusGateway {
  @SubscribeMessage('subscribe')
  handleSubscribe(@MessageBody() { fileId }: { fileId: string }, @ConnectedSocket() client: Socket) {
    client.join(`file:${fileId}`)
  }
}
```

**Worker publishes events to Redis channel** → gateway picks up → emits to room `file:{fileId}`.

**Client hook:**
```ts
function useFileStatus(fileId: string) {
  // Attempts WebSocket; falls back to 10s polling if connection fails
  // Returns: { status, embeddingProgress: 0-100, transcriptionStatus }
}
```

**Nginx WebSocket proxy config** (must be added to `infra/nginx/`):
```nginx
location /socket.io/ {
  proxy_pass http://kms-api:8000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```
