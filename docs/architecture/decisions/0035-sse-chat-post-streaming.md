# 0035 — SSE Chat Endpoint Uses POST with fetch() Streaming

**Status:** Accepted
**Date:** 2026-04-01
**Deciders:** Gaurav Porwal

---

## Context

The content chat endpoints (`POST /content/jobs/:id/chat` and `POST /content/jobs/:id/chat/:pieceId`) need to:

1. Accept a request **body** containing the user's chat message (`{ message: string }`).
2. Stream the Claude AI response back to the client as Server-Sent Events (SSE).

The first implementation used NestJS `@Sse()` + `@Body()`. This is architecturally broken because:

- `@Sse()` creates a **GET** route. The HTTP/1.1 spec does not allow a body on GET requests.
- The browser's native `EventSource` API only supports GET and does not allow custom request headers or a body. `@Body()` is therefore never populated — the message is always `undefined`.
- NestJS silently allows this decorator combination, so the bug is not caught at compile time.

The fix requires a transport mechanism that:
- Accepts a POST body (for the chat message and auth header).
- Streams the response incrementally (for real-time Claude token delivery).

---

## Decision

Replace `@Sse` + `Observable<MessageEvent>` on the chat endpoints with `@Post` + manual SSE framing via `@Res() res: FastifyReply`.

**Controller pattern:**

```ts
@Post('jobs/:id/chat')
async sendChatMessage(
  @Param('id', ParseUUIDPipe) jobId: string,
  @Body() dto: SendChatMessageDto,
  @Req() req: any,
  @Res() res: FastifyReply,
): Promise<void> {
  res.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    const gen = this.contentChatService.streamChat(jobId, null, dto.message, userId);
    for await (const chunk of gen) {
      res.raw.write(`data: ${chunk}\n\n`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Generation failed';
    res.raw.write(`data: [ERROR] ${msg}\n\n`);
  }

  res.raw.end();
}
```

**Client contract (assumption — see below):** The frontend MUST use `fetch()` with streaming mode:

```js
const res = await fetch('/api/content/jobs/:id/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <token>',
  },
  body: JSON.stringify({ message }),
});
const reader = res.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  // Parse SSE frames: "data: <chunk>\n\n"
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const chunk = line.slice(6);
      if (chunk === '[DONE]') return;
      if (chunk.startsWith('[ERROR]')) { /* handle */ }
      // append chunk to UI
    }
  }
}
```

The `streamJobStatus` endpoint (`GET /content/jobs/:id/status`) is **not affected** — it sends no body and continues using `@Sse` + `Observable<MessageEvent>`, which is the correct pattern for GET-only SSE streams.

---

## Consequences

### Positive

- **Body works correctly.** `@Post` + `@Body()` is standard NestJS — the message is always populated.
- **Compatible with any HTTP client.** `fetch()`, `axios`, `curl` — all support POST + streaming body read.
- **Auth headers work.** The JWT `Authorization: Bearer` header is passed normally on POST; it cannot be set on native `EventSource` GET.
- **nginx-friendly.** `X-Accel-Buffering: no` prevents nginx from holding the stream until completion.
- **Error surfacing.** Errors mid-stream are written as `data: [ERROR] <message>\n\n` frames before the connection closes, giving the client a signal even after headers are committed.

### Negative

- **Cannot use native `EventSource`.** The browser's `EventSource` API only works with GET endpoints. Any code using `new EventSource('/api/content/jobs/:id/chat')` will not work.
- **Manual SSE framing.** NestJS `@Sse` automatically handles SSE framing; with `@Post` + `@Res()` the controller must manually write `data: ...\n\n` frames and call `res.raw.end()`.
- **`@Res()` bypasses NestJS response lifecycle.** Using `@Res()` means interceptors and exception filters that operate on the response object are bypassed. Error handling must be done explicitly in the try/catch block.

### Mitigation

- **EventSource limitation:** The frontend is a Next.js dashboard — all API calls already use `fetch()`. Native `EventSource` was never used. This limitation has no practical impact.
- **Manual framing:** The framing logic is a simple 3-line pattern encapsulated in one controller method. It is tested in `content.controller.spec.ts`.
- **Lifecycle bypass:** The try/catch inside the method handles all generator errors and writes a `[ERROR]` frame before ending the response. Auth and guard failures are handled before `@Res()` is reached (guards run before the handler).

---

## Assumptions

1. **Client environment is always a modern browser or Node.js fetch.** The Next.js dashboard uses the native `fetch()` API. Server-side rendering uses Node.js 18+ `fetch`. Both support `ReadableStream` / `getReader()`.
2. **No native `EventSource` usage exists or will be introduced for chat endpoints.** If a native `EventSource` consumer is ever needed, a separate GET polling endpoint should be created instead of reverting this decision.
3. **nginx is configured with `proxy_buffering off` or the `X-Accel-Buffering: no` header is respected.** Without this, nginx may buffer the entire response before forwarding to the client, defeating the purpose of streaming.

---

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| Keep `@Sse` + query param for message | Exposes message content in URLs (logs, history, CORS preflight issues). Not appropriate for user-generated content. |
| WebSocket | Heavyweight for one-way streaming. Requires a separate WS server setup and CORS/auth wiring that already works over HTTP. |
| Polling endpoint | Introduces latency, extra DB reads, and client-side polling logic. SSE with streaming is simpler and more responsive. |
| `@Sse` + GET with body via fetch | Non-standard. Some proxies strip GET bodies. NestJS route matching expects `@Body()` on POST/PUT only. |
