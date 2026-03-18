/**
 * Chat API — SSE streaming wrapper over the /api/v1/chat endpoint.
 *
 * Uses the Fetch API directly for streaming because Axios does not
 * natively support SSE. The auth token is read from localStorage key
 * set by the auth store to avoid coupling to the store module.
 */

import { authStore } from '@/lib/stores/auth.store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceRef {
  fileId: string;
  title: string;
  path: string;
  mimeType: string;
}

export type SseEventType = 'chunk' | 'sources' | 'done' | 'error';

export interface SseChunkEvent {
  type: 'chunk';
  text: string;
}

export interface SseSourcesEvent {
  type: 'sources';
  sources: SourceRef[];
}

export interface SseDoneEvent {
  type: 'done';
  runId: string;
}

export interface SseErrorEvent {
  type: 'error';
  message: string;
}

export type SseEvent = SseChunkEvent | SseSourcesEvent | SseDoneEvent | SseErrorEvent;

// ---------------------------------------------------------------------------
// Helper: resolve current access token
// ---------------------------------------------------------------------------

function getToken(): string | null {
  return authStore.state.accessToken;
}

// ---------------------------------------------------------------------------
// Helper: resolve base URL
// ---------------------------------------------------------------------------

function getBaseUrl(): string {
  return (
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) ||
    'http://localhost:8000'
  );
}

// ---------------------------------------------------------------------------
// SSE stream handler
// ---------------------------------------------------------------------------

export interface ChatStreamCallbacks {
  onChunk: (text: string) => void;
  onSources: (sources: SourceRef[]) => void;
  onDone: (runId: string) => void;
  onError: (err: Error) => void;
}

/**
 * chatApi.stream — sends a query and streams the RAG response via SSE.
 *
 * The server emits newline-delimited JSON events:
 *   data: {"type":"chunk","text":"Hello"}
 *   data: {"type":"sources","sources":[...]}
 *   data: {"type":"done","runId":"abc-123"}
 *
 * @param query - The user's message
 * @param sessionId - Optional session ID for multi-turn conversations
 * @param callbacks - Handlers for chunk, sources, done, and error events
 * @returns An AbortController — call `.abort()` to cancel the stream
 */
export function streamChat(
  query: string,
  sessionId: string | undefined,
  callbacks: ChatStreamCallbacks,
): AbortController {
  const controller = new AbortController();
  const token = getToken();
  const baseUrl = getBaseUrl();

  (async () => {
    try {
      const response = await fetch(`${baseUrl}/api/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, session_id: sessionId }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response body is not readable');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last (potentially incomplete) line in buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const event = JSON.parse(jsonStr) as SseEvent;
            switch (event.type) {
              case 'chunk':
                callbacks.onChunk(event.text);
                break;
              case 'sources':
                callbacks.onSources(event.sources);
                break;
              case 'done':
                callbacks.onDone(event.runId);
                break;
              case 'error':
                callbacks.onError(new Error(event.message));
                break;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  })();

  return controller;
}
