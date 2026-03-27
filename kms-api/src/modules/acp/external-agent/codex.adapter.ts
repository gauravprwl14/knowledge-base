import { randomUUID } from 'crypto';
import { AppLogger } from '../../../logger/logger.service';
import { AppError } from '../../../errors/types/app-error';
import { ERROR_CODES } from '../../../errors/error-codes';
import {
  IExternalAgentAdapter,
  AgentContextChunk,
  ExternalAgentEvent,
} from './external-agent.interface';

/**
 * Default OpenAI model to use when OPENAI_MODEL is not set.
 * Using o4-mini as specified; can be overridden via env var.
 */
const DEFAULT_MODEL = 'o4-mini';

/**
 * Base URL for the OpenAI Responses API.
 * Overridable via OPENAI_API_BASE_URL for proxies / Azure OpenAI.
 */
const DEFAULT_API_BASE = 'https://api.openai.com';

/**
 * Maximum time in milliseconds to wait for the OpenAI API to begin streaming.
 */
const CONNECT_TIMEOUT_MS = 30_000;

/**
 * Maximum time in milliseconds to wait for the full stream to complete.
 * Intentionally generous — code generation tasks can be slow.
 */
const STREAM_TIMEOUT_MS = 180_000;

/**
 * HttpCodexAdapter — IExternalAgentAdapter implementation for OpenAI Codex / o-series models.
 *
 * Codex does not expose an ACP-over-stdio binary that is reliably available in all
 * environments. This adapter instead calls the OpenAI Responses API directly via
 * fetch and maps the streamed server-sent events to the ACP event format expected by
 * the KMS agentic platform (ADR-0023).
 *
 * Session model:
 * - Gemini is stateless per call: each `ensureSession()` allocates a UUID that
 *   the caller uses to correlate subsequent calls. No server-side session state is held.
 * - `closeSession` is a no-op.
 *
 * OpenAI Responses API streaming:
 * - POST /v1/responses with `stream: true`
 * - Emits SSE events of type `response.output_text.delta`, `response.done`,
 *   `error`, etc.
 * - Each event is mapped to an {@link ExternalAgentEvent}.
 *
 * Environment variables:
 * - `OPENAI_API_KEY`     (required) — secret key for the OpenAI API.
 * - `OPENAI_MODEL`       (optional) — model ID, defaults to `o4-mini`.
 * - `OPENAI_API_BASE_URL`(optional) — base URL override for proxies / Azure OpenAI.
 *
 * Error codes:
 * - `EXT0014` (CODEX_SESSION_FAILED) — ensureSession failed (config missing / API unreachable).
 * - `EXT0015` (CODEX_PROMPT_FAILED) — sendPrompt failed (API rejected the request).
 * - `EXT0016` (CODEX_STREAM_FAILED) — streamEvents failed mid-stream.
 *
 * @example
 * ```typescript
 * const adapter = new HttpCodexAdapter(logger);
 * const agentSessionId = await adapter.ensureSession(kmsSessionId, userId);
 * await adapter.sendPrompt(agentSessionId, 'Implement a binary search in TypeScript');
 * for await (const event of adapter.streamEvents(agentSessionId)) {
 *   if (event.type === 'done') break;
 * }
 * await adapter.close(agentSessionId);
 * ```
 */
export class HttpCodexAdapter implements IExternalAgentAdapter {
  private readonly logger: AppLogger;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly apiBase: string;

  /**
   * Per-session state. Maps agentSessionId → pending prompt (stored until streamEvents reads it).
   * The adapter is intentionally stateless between calls; we store the prompt so that
   * `sendPrompt` and `streamEvents` can be called independently as the interface requires.
   */
  private readonly pendingPrompts = new Map<
    string,
    { prompt: string; context: AgentContextChunk[] }
  >();

  /**
   * Creates a new HttpCodexAdapter.
   *
   * Reads credentials and model configuration from environment variables at
   * construction time so that misconfiguration fails fast at startup rather
   * than at request time.
   *
   * @param logger - Bound AppLogger instance (injected by the factory).
   * @throws AppError (EXT0014) when `OPENAI_API_KEY` is not set.
   */
  constructor(logger: AppLogger) {
    this.logger = logger.child({ context: HttpCodexAdapter.name });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AppError({
        code: ERROR_CODES.EXT.CODEX_SESSION_FAILED.code,
        message: 'OPENAI_API_KEY environment variable is not set — HttpCodexAdapter cannot start',
        statusCode: 503,
      });
    }

    this.apiKey = apiKey;
    this.model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
    this.apiBase = (process.env.OPENAI_API_BASE_URL ?? DEFAULT_API_BASE).replace(/\/$/, '');

    this.logger.info('HttpCodexAdapter: initialised', { model: this.model, apiBase: this.apiBase });
  }

  /**
   * Allocates a local UUID to act as the "session" ID.
   *
   * OpenAI's Responses API is stateless — there is no server-side session to
   * create. We generate a UUID so that callers can correlate calls within a
   * single logical session while we store pending prompt state keyed by it.
   *
   * @param sessionId - KMS-side session ID (used for logging only).
   * @param userId    - Authenticated user UUID (used for logging only).
   * @returns The allocated agent session UUID.
   */
  async ensureSession(sessionId: string, userId: string): Promise<string> {
    const agentSessionId = randomUUID();
    this.logger.info('HttpCodexAdapter: session allocated', {
      kmsSessionId: sessionId,
      agentSessionId,
      userId,
      model: this.model,
    });
    return agentSessionId;
  }

  /**
   * Stores the prompt and context so they are available when `streamEvents` is called.
   *
   * The OpenAI Responses API does not support a "send then stream separately" model —
   * the stream begins in the same HTTP response as the POST. We therefore buffer the
   * prompt here and open the streaming connection inside `streamEvents`.
   *
   * @param agentSessionId - The agent-side session ID from `ensureSession`.
   * @param prompt         - The user prompt to send to Codex.
   * @param context        - Optional KMS knowledge-base chunks to inject as context.
   */
  async sendPrompt(
    agentSessionId: string,
    prompt: string,
    context: AgentContextChunk[] = [],
  ): Promise<void> {
    this.pendingPrompts.set(agentSessionId, { prompt, context });
    this.logger.info('HttpCodexAdapter: prompt queued', {
      agentSessionId,
      promptLength: prompt.length,
      contextChunks: context.length,
    });
  }

  /**
   * Opens a streaming connection to the OpenAI Responses API and yields ACP events.
   *
   * Maps OpenAI SSE event types to ACP event types:
   * - `response.output_text.delta` → `agent_message_chunk`
   * - `response.done`              → `done`
   * - `error`                      → `error`
   *
   * The generator terminates when a `done` or `error` event is yielded.
   *
   * @param agentSessionId - The agent-side session ID from `ensureSession`.
   * @yields {@link ExternalAgentEvent} objects until the stream ends.
   * @throws AppError (EXT0015) when the API returns a non-2xx response.
   * @throws AppError (EXT0016) when the network stream is interrupted.
   */
  async *streamEvents(agentSessionId: string): AsyncIterable<ExternalAgentEvent> {
    const pending = this.pendingPrompts.get(agentSessionId);
    if (!pending) {
      throw new AppError({
        code: ERROR_CODES.EXT.CODEX_PROMPT_FAILED.code,
        message: `HttpCodexAdapter: no pending prompt for session ${agentSessionId} — call sendPrompt first`,
        statusCode: 422,
      });
    }

    this.pendingPrompts.delete(agentSessionId);

    const { prompt, context } = pending;
    const userContent = this.buildUserContent(prompt, context);

    this.logger.info('HttpCodexAdapter: opening stream to OpenAI Responses API', {
      agentSessionId,
      model: this.model,
      contextChunks: context.length,
    });

    let response: Response;
    try {
      response = await fetch(`${this.apiBase}/v1/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: this.model,
          input: userContent,
          stream: true,
        }),
        signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error('HttpCodexAdapter: network error opening stream', {
        agentSessionId,
        error: (err as Error).message,
      });
      throw new AppError({
        code: ERROR_CODES.EXT.CODEX_STREAM_FAILED.code,
        message: `HttpCodexAdapter: network error connecting to OpenAI API — ${(err as Error).message}`,
        cause: err instanceof Error ? err : undefined,
      });
    }

    if (!response.ok || !response.body) {
      const statusText = await response.text().catch(() => '');
      this.logger.error('HttpCodexAdapter: non-2xx response from OpenAI API', {
        agentSessionId,
        status: response.status,
        body: statusText.slice(0, 300),
      });
      throw new AppError({
        code: ERROR_CODES.EXT.CODEX_PROMPT_FAILED.code,
        message: `HttpCodexAdapter: OpenAI API returned HTTP ${response.status}`,
        statusCode: response.status === 429 ? 429 : response.status >= 500 ? 502 : response.status,
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Apply stream-level timeout via a race promise
    const streamDeadline = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new AppError({
              code: ERROR_CODES.EXT.CODEX_STREAM_FAILED.code,
              message: `HttpCodexAdapter: stream timeout after ${STREAM_TIMEOUT_MS / 1000}s`,
              statusCode: 504,
            }),
          ),
        STREAM_TIMEOUT_MS,
      ),
    );

    try {
      while (true) {
        const { done, value } = await Promise.race([
          reader.read(),
          streamDeadline,
        ]);

        if (done) {
          yield { type: 'done', data: { reason: 'stream_closed' } };
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const event = this.parseSSELine(line, agentSessionId);
          if (!event) continue;
          yield event;
          if (event.type === 'done' || event.type === 'error') return;
        }
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      this.logger.error('HttpCodexAdapter: stream read error', {
        agentSessionId,
        error: (err as Error).message,
      });
      throw new AppError({
        code: ERROR_CODES.EXT.CODEX_STREAM_FAILED.code,
        message: `HttpCodexAdapter: stream interrupted — ${(err as Error).message}`,
        cause: err instanceof Error ? err : undefined,
      });
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * No-op for a stateless HTTP adapter — there is no persistent connection to cancel.
   * Logs the cancel request for observability.
   *
   * @param agentSessionId - The agent-side session ID to cancel.
   */
  async cancel(agentSessionId: string): Promise<void> {
    // Remove any buffered prompt to prevent it being sent later
    this.pendingPrompts.delete(agentSessionId);
    this.logger.info('HttpCodexAdapter: cancel called (pending prompt cleared)', {
      agentSessionId,
    });
  }

  /**
   * Cleans up local session state.
   * The OpenAI Responses API has no server-side session to close.
   *
   * @param agentSessionId - The agent-side session ID to close.
   */
  async close(agentSessionId: string): Promise<void> {
    this.pendingPrompts.delete(agentSessionId);
    this.logger.info('HttpCodexAdapter: session closed', { agentSessionId });
  }

  /**
   * Performs a lightweight health check by calling the OpenAI models list endpoint.
   *
   * @returns `true` when the OpenAI API responds with HTTP 200, `false` otherwise.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBase}/v1/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5_000),
      });
      const ok = response.ok;
      this.logger.info('HttpCodexAdapter: health check', { ok, status: response.status });
      return ok;
    } catch (err) {
      this.logger.warn('HttpCodexAdapter: health check failed', {
        error: (err as Error).message,
      });
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds the user content string for the OpenAI Responses API input.
   *
   * Injects context chunks (if any) as a formatted block before the user prompt
   * so the model can ground its response in KMS search results.
   *
   * @param prompt  - The raw user prompt.
   * @param context - KMS search result chunks to inject.
   * @returns Formatted input string ready to send to the API.
   */
  private buildUserContent(prompt: string, context: AgentContextChunk[]): string {
    if (context.length === 0) return prompt;

    const contextBlock = context
      .map((c, i) => `[${i + 1}] ${c.filename} (score: ${c.score.toFixed(3)})\n${c.content}`)
      .join('\n\n---\n\n');

    return `Context from knowledge base:\n\n${contextBlock}\n\n---\n\n${prompt}`;
  }

  /**
   * Parses a single SSE `data:` line from the OpenAI stream and maps it
   * to an {@link ExternalAgentEvent}.
   *
   * OpenAI event types handled:
   * - `response.output_text.delta` — text token chunk
   * - `response.done`              — stream complete
   * - `error`                      — API-level error
   *
   * @param line           - Raw SSE line (e.g. `data: {...}`).
   * @param agentSessionId - Used for log context on parse failures.
   * @returns Mapped event, or `null` if the line should be skipped.
   */
  private parseSSELine(line: string, agentSessionId: string): ExternalAgentEvent | null {
    if (!line.startsWith('data: ')) return null;
    const raw = line.slice(6).trim();
    if (!raw || raw === '[DONE]') {
      return { type: 'done', data: { reason: 'stream_done_sentinel' } };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.logger.warn('HttpCodexAdapter: malformed SSE line (skipped)', {
        agentSessionId,
        line: line.slice(0, 200),
      });
      return null;
    }

    const eventType = parsed.type as string | undefined;

    // Text delta — the main streaming token
    if (eventType === 'response.output_text.delta') {
      const delta = parsed.delta as Record<string, unknown> | undefined;
      return {
        type: 'agent_message_chunk',
        data: { text: (delta?.text as string) ?? '' },
      };
    }

    // Stream complete
    if (eventType === 'response.done') {
      return { type: 'done', data: { raw: parsed } };
    }

    // API-level error event
    if (eventType === 'error') {
      this.logger.error('HttpCodexAdapter: error event received from OpenAI', {
        agentSessionId,
        event: parsed,
      });
      return { type: 'error', data: { message: parsed.message ?? 'OpenAI error event' } };
    }

    // Unknown event type — log at debug level and skip
    this.logger.info('HttpCodexAdapter: unhandled SSE event type (skipped)', {
      agentSessionId,
      eventType,
    });

    return null;
  }
}
