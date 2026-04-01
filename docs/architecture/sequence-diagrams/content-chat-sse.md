# Content Chat SSE — POST Streaming Sequence Diagram

This diagram shows the full request/response lifecycle for the content chat SSE
endpoint (`POST /content/jobs/:id/chat` and `POST /content/jobs/:id/chat/:pieceId`).

**Key design constraint:** The endpoint uses `@Post` + manual SSE framing (not `@Sse` GET)
because the chat message must be sent in the request body. See ADR-0035 for the full
architectural rationale.

---

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber

    participant Client as Browser / Next.js (fetch + ReadableStream)
    participant Nginx as nginx proxy
    participant NestJS as NestJS (ContentController)
    participant Guard as JwtAuthGuard
    participant Prisma as PrismaService
    participant Chat as ContentChatService
    participant Anthropic as Anthropic SDK (Claude)

    %% ── Phase 1: Request ingress and auth ───────────────────────────────────
    Client->>Nginx: POST /kms/api/v1/content/jobs/:id/chat\nHeaders: Authorization: Bearer <token>\nBody: { "message": "Improve my post" }

    Note over Nginx: proxy_pass → kms-api:3001\nX-Accel-Buffering: no (set on response)

    Nginx->>NestJS: Forward POST request

    NestJS->>Guard: JwtAuthGuard.canActivate(context)
    Guard-->>NestJS: ✓ req.user.id = "user-uuid"

    %% ── Phase 2: Controller writes SSE headers ───────────────────────────────
    Note over NestJS: res.raw.writeHead(200, {\n  Content-Type: text/event-stream,\n  Cache-Control: no-cache,\n  Connection: keep-alive,\n  X-Accel-Buffering: no\n})
    NestJS-->>Client: HTTP 200 + SSE headers (stream begins)

    %% ── Phase 3: Service loads context from DB ────────────────────────────────
    NestJS->>Chat: streamChat(jobId, pieceId|null, message, userId)

    Chat->>Prisma: contentJob.findUnique({ where: { id: jobId } })
    Prisma-->>Chat: ContentJob record (ownership verified)

    Chat->>Prisma: contentChatMessage.findMany({ where: { jobId, pieceId } })
    Prisma-->>Chat: Previous chat messages (conversation history)

    alt pieceId provided
        Chat->>Prisma: contentPiece.findUnique({ where: { id: pieceId } })
        Prisma-->>Chat: ContentPiece record (piece content for context)
    end

    %% ── Phase 4: Streaming generation via Anthropic SDK ──────────────────────
    Chat->>Anthropic: messages.stream({ model, system, messages, max_tokens })
    Note over Anthropic: Claude begins generating token by token

    loop For each text chunk yielded by the generator
        Anthropic-->>Chat: text delta (partial token)
        Chat-->>NestJS: yield chunk (AsyncGenerator)
        NestJS->>Client: res.raw.write("data: <chunk>\n\n")
        Note over Client: ReadableStream reader receives chunk;\nappend to UI in real time
    end

    %% ── Phase 5: Stream completion ───────────────────────────────────────────
    Anthropic-->>Chat: Stream complete (final event)
    Chat-->>NestJS: yield "[DONE]"
    NestJS->>Client: res.raw.write("data: [DONE]\n\n")

    %% ── Phase 6: Persist assistant message ───────────────────────────────────
    Chat->>Prisma: contentChatMessage.create({ role: "assistant", content: fullText })
    Prisma-->>Chat: Saved message record

    NestJS->>Client: res.raw.end() — closes HTTP response
    Note over Client: ReadableStream reader.read() returns { done: true }

    %% ── Error path ────────────────────────────────────────────────────────────
    rect rgb(255, 235, 235)
        Note over Chat,NestJS: Error path (generator throws)
        Chat--xNestJS: throw Error("Claude API error")
        NestJS->>Client: res.raw.write("data: [ERROR] Claude API error\n\n")
        NestJS->>Client: res.raw.end()
        Note over Client: Client detects [ERROR] frame and\ndisplays error message to user
    end
```

---

## Client Usage Pattern

The frontend MUST use `fetch()` with `ReadableStream` — **NOT** the native `EventSource` API.
`EventSource` only supports GET and cannot send a body or custom headers.

```ts
/**
 * Sends a chat message and reads the SSE response as a streaming fetch.
 *
 * @param jobId   - Content job UUID.
 * @param message - User's chat message.
 * @param token   - JWT access token.
 * @param onChunk - Callback invoked for each received text chunk.
 */
async function sendChatMessage(
  jobId: string,
  message: string,
  token: string,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const res = await fetch(`/api/content/jobs/${jobId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Decode the raw bytes and split on SSE frame boundaries
    const text = decoder.decode(value, { stream: true });
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue;

      const chunk = line.slice(6); // strip "data: " prefix
      if (chunk === '[DONE]') return;
      if (chunk.startsWith('[ERROR]')) {
        throw new Error(chunk.slice(8)); // strip "[ERROR] " prefix
      }
      onChunk(chunk);
    }
  }
}
```

---

## Notes

- The `streamJobStatus` GET endpoint (`GET /content/jobs/:id/status`) uses the standard `@Sse` +
  `Observable<MessageEvent>` pattern and is **unaffected** by this design. It sends no body.
- `X-Accel-Buffering: no` must be forwarded by nginx (or set in the response) to prevent
  nginx from buffering the stream. Without it, chunks accumulate until the stream closes.
- The assistant message is persisted to the DB **after** the stream completes, not per-chunk.
  This keeps the DB write off the critical path and avoids partial-message rows.
- If the job does not exist or belongs to another user, `ContentChatService.streamChat` throws
  before any SSE headers are written, so a normal 403/404 HTTP response is returned instead.
