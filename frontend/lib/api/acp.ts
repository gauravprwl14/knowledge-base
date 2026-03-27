/**
 * ACP API client — handles ACP session lifecycle and SSE streaming.
 *
 * Manages:
 * 1. Initialize: handshake with the ACP server (public endpoint)
 * 2. Session create: authenticated session with user JWT
 * 3. Prompt: SSE streaming prompt → response pipeline
 * 4. Session close: clean up Redis session
 *
 * Uses native fetch + ReadableStream for SSE since EventSource doesn't
 * support POST requests. The async generator pattern lets callers
 * iterate events without managing stream state themselves.
 */

/**
 * Base URL for kms-api including the /api/v1 global prefix.
 *
 * Set NEXT_PUBLIC_KMS_API_URL=http://localhost:8000/api/v1 in .env.local
 *
 * WHY /api/v1 is included here:
 * - kms-api sets a global prefix "api/v1" in main.ts
 * - All controllers are registered under this prefix
 * - AcpController at "acp/v1" becomes /api/v1/acp/v1/initialize
 * - Storing the full base (including prefix) keeps all API clients consistent
 */
const KMS_API_URL = process.env.NEXT_PUBLIC_KMS_API_URL ?? 'http://localhost:8000/api/v1';

export interface AcpTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AcpCapabilities {
  protocolVersion: number;
  agentCapabilities: { tools: AcpTool[] };
}

export type AcpEventType =
  | 'agent_message_chunk'
  | 'tool_call_start'
  | 'tool_call_result'
  | 'done'
  | 'error';

export interface AcpEvent {
  type: AcpEventType;
  data: {
    text?: string;                    // for agent_message_chunk
    tool?: string;                    // for tool_call_start / tool_call_result
    args?: Record<string, unknown>;   // for tool_call_start
    resultCount?: number;             // for tool_call_result
    message?: string;                 // for error
  };
}

/**
 * Perform the ACP handshake. Returns server capabilities including tool list.
 * No authentication required — this is a public discovery endpoint.
 */
async function _realAcpInitialize(): Promise<AcpCapabilities> {
  const res = await fetch(`${KMS_API_URL}/acp/v1/initialize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      protocolVersion: 1,
      clientInfo: { name: 'kms-web', version: '1.0.0' },
    }),
  });
  if (!res.ok) throw new Error(`ACP initialize failed: ${res.status}`);
  return res.json() as Promise<AcpCapabilities>;
}

/**
 * Create an ACP session for the authenticated user.
 * Stores the session ID in memory — caller should persist if needed.
 *
 * @param token - JWT access token from the auth store.
 * @returns Session ID string (UUID).
 */
async function _realAcpCreateSession(token: string): Promise<string> {
  const res = await fetch(`${KMS_API_URL}/acp/v1/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`ACP create session failed: ${res.status}`);
  const data = (await res.json()) as { sessionId: string };
  return data.sessionId;
}

/**
 * SSE STREAMING FLOW — HOW IT WORKS
 *
 * Browser cannot use native EventSource for ACP because:
 *   1. EventSource only supports GET requests
 *   2. We need to send a JSON body (the prompt)
 *
 * Instead we use fetch + ReadableStream:
 *   fetch(POST /api/v1/acp/v1/sessions/:id/prompt, { Accept: text/event-stream })
 *   → NestJS @Sse decorator sets Content-Type: text/event-stream
 *   → Returns an RxJS Observable<MessageEvent> backed by ReplaySubject(100)
 *   → For each observable emission: server writes "data: {json}\n\n"
 *   → Browser reads chunks from response.body (ReadableStream)
 *   → Splits on \n, finds "data:" lines, JSON-parses each
 *   → Yields AcpEvent objects (agent_message_chunk | tool_call_start | done | error)
 *
 * Event types (from AcpEventEmitter):
 *   agent_message_chunk: { text }         ← Claude text token
 *   tool_call_start:     { tool, args }   ← kms_search invoked
 *   tool_call_result:    { tool, resultCount } ← search results count
 *   done:                {}               ← stream complete, close reader
 *   error:               { message }      ← pipeline error, close reader
 *
 * Stream a prompt through ACP and yield parsed AcpEvent objects.
 *
 * Uses fetch + ReadableStream for SSE since EventSource doesn't support POST.
 * Caller iterates the async generator to consume events in real time.
 *
 * SSE wire format: each event arrives as one or more lines ending with "\n\n":
 *   data: {"type":"agent_message_chunk","data":{"text":"Hello"}}\n\n
 *
 * @param sessionId - Active ACP session UUID.
 * @param token - JWT access token.
 * @param question - The user's question text.
 *
 * @example
 * ```typescript
 * for await (const event of acpPromptStream(sessionId, token, "what is BGE-M3?")) {
 *   if (event.type === 'agent_message_chunk') append(event.data.text ?? '');
 *   if (event.type === 'done') break;
 * }
 * ```
 */
async function* _realAcpPromptStream(
  sessionId: string,
  token: string,
  question: string,
): AsyncGenerator<AcpEvent> {
  const res = await fetch(`${KMS_API_URL}/acp/v1/sessions/${sessionId}/prompt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ prompt: [{ type: 'text', text: question }] }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`ACP prompt failed: ${res.status}`);
  }

  // Read the response body as a byte stream, decode line-by-line
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  // Holds any incomplete SSE line fragment between chunk reads
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // stream:true keeps state across reads for multi-byte characters
      buffer += decoder.decode(value, { stream: true });

      // Split on newlines; the last element is the incomplete fragment
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep the unterminated line for next read

      for (const line of lines) {
        const trimmed = line.trim();
        // SSE lines that carry data start with "data:"
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        // Strip the "data: " prefix (5 chars) before parsing JSON
        const jsonStr = trimmed.slice(5).trim();
        try {
          const event = JSON.parse(jsonStr) as AcpEvent;
          yield event;
          // Terminal events: stop iterating immediately
          if (event.type === 'done' || event.type === 'error') return;
        } catch {
          // Malformed SSE line — skip silently rather than crashing
        }
      }
    }
  } finally {
    // Always release the lock so the body can be garbage-collected
    reader.releaseLock();
  }
}

/**
 * Close an ACP session and remove it from Redis.
 * Best-effort — fire and forget on page unload.
 *
 * @param sessionId - Session UUID to close.
 * @param token - JWT access token.
 */
async function _realAcpCloseSession(sessionId: string, token: string): Promise<void> {
  await fetch(`${KMS_API_URL}/acp/v1/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Mock swap ───────────────────────────────────────────────────────────────
// To use real API: remove NEXT_PUBLIC_USE_MOCK from .env.local (or set to false).

import {
  mockAcpInitialize,
  mockAcpCreateSession,
  mockAcpPromptStream,
  mockAcpCloseSession,
} from '@/lib/mock/handlers/acp.mock';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';

export const acpInitialize = USE_MOCK ? mockAcpInitialize : _realAcpInitialize;
export const acpCreateSession = USE_MOCK ? mockAcpCreateSession : _realAcpCreateSession;
export const acpPromptStream = USE_MOCK ? mockAcpPromptStream : _realAcpPromptStream;
export const acpCloseSession = USE_MOCK ? mockAcpCloseSession : _realAcpCloseSession;
