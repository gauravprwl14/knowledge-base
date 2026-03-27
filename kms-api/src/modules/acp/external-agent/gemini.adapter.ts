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
 * Default Gemini model used when GEMINI_MODEL is not configured.
 * gemini-2.0-flash provides the best speed/quality balance for interactive agent tasks.
 */
const DEFAULT_MODEL = 'gemini-2.0-flash';

/**
 * Base URL for the Google Generative Language API (v1beta).
 */
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

/**
 * Maximum milliseconds to wait for the first byte of the streaming response.
 */
const CONNECT_TIMEOUT_MS = 30_000;

/**
 * Maximum milliseconds to wait for the full stream to complete.
 */
const STREAM_TIMEOUT_MS = 180_000;

/**
 * GeminiAdapter — IExternalAgentAdapter implementation for Google Gemini API.
 *
 * Uses the `streamGenerateContent` endpoint of the Google Generative Language API
 * (v1beta) and maps its streamed JSON chunks to the ACP event format expected by
 * the KMS agentic platform (ADR-0023).
 *
 * Session model:
 * - Gemini is stateless per call: each `ensureSession()` allocates a local UUID.
 *   No server-side session is created; `closeSession` is a no-op.
 * - Prompt and context are buffered in `sendPrompt` and consumed by `streamEvents`.
 *
 * Gemini streaming:
 * - POST to `{base}/v1beta/models/{model}:streamGenerateContent?key={apiKey}&alt=sse`
 * - Returns a chunked JSON array where each item is a `GenerateContentResponse`.
 * - Each response may contain one or more `candidates[].content.parts[].text` tokens.
 * - A `finishReason` of `"STOP"` signals the end of generation.
 *
 * Environment variables:
 * - `GEMINI_API_KEY` (required) — secret key for the Google AI Studio / Vertex API.
 * - `GEMINI_MODEL`   (optional) — model ID, defaults to `gemini-2.0-flash`.
 *
 * Error codes:
 * - `EXT0017` (GEMINI_SESSION_FAILED) — ensureSession failed (config missing).
 * - `EXT0018` (GEMINI_PROMPT_FAILED)  — sendPrompt validation failed / API rejected.
 * - `EXT0019` (GEMINI_STREAM_FAILED)  — network or parse error during streaming.
 *
 * @example
 * ```typescript
 * const adapter = new GeminiAdapter(logger);
 * const agentSessionId = await adapter.ensureSession(kmsSessionId, userId);
 * await adapter.sendPrompt(agentSessionId, 'Explain transformer architecture');
 * for await (const event of adapter.streamEvents(agentSessionId)) {
 *   if (event.type === 'done') break;
 * }
 * await adapter.close(agentSessionId);
 * ```
 */
export class GeminiAdapter implements IExternalAgentAdapter {
  private readonly logger: AppLogger;
  private readonly apiKey: string;
  private readonly model: string;

  /**
   * Per-session pending prompts. Maps agentSessionId → buffered prompt + context.
   * Populated by `sendPrompt`, consumed and cleared by `streamEvents`.
   */
  private readonly pendingPrompts = new Map<
    string,
    { prompt: string; context: AgentContextChunk[] }
  >();

  /**
   * Creates a new GeminiAdapter.
   *
   * Reads credentials and model configuration from environment variables at
   * construction time so that misconfiguration is caught at startup.
   *
   * @param logger - Bound AppLogger instance (injected by the factory).
   * @throws AppError (EXT0017) when `GEMINI_API_KEY` is not set.
   */
  constructor(logger: AppLogger) {
    this.logger = logger.child({ context: GeminiAdapter.name });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AppError({
        code: ERROR_CODES.EXT.GEMINI_SESSION_FAILED.code,
        message: 'GEMINI_API_KEY environment variable is not set — GeminiAdapter cannot start',
        statusCode: 503,
      });
    }

    this.apiKey = apiKey;
    this.model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

    this.logger.info('GeminiAdapter: initialised', { model: this.model });
  }

  /**
   * Allocates a local UUID as the "session" ID.
   *
   * Gemini's API is stateless — no server-side session is created. The UUID
   * allows callers to correlate `sendPrompt` and `streamEvents` calls and
   * lets us store the pending prompt in memory between them.
   *
   * @param sessionId - KMS-side session ID (used for correlation logging only).
   * @param userId    - Authenticated user UUID (used for correlation logging only).
   * @returns A newly allocated UUID used as the agent session ID.
   */
  async ensureSession(sessionId: string, userId: string): Promise<string> {
    const agentSessionId = randomUUID();
    this.logger.info('GeminiAdapter: session allocated', {
      kmsSessionId: sessionId,
      agentSessionId,
      userId,
      model: this.model,
    });
    return agentSessionId;
  }

  /**
   * Buffers the prompt and context for the given session.
   *
   * The Gemini streaming API does not support a "send then poll" pattern — the
   * stream begins in the same response as the POST. We buffer the data here and
   * open the connection in `streamEvents`.
   *
   * @param agentSessionId - The agent-side session ID from `ensureSession`.
   * @param prompt         - The user prompt to send to Gemini.
   * @param context        - Optional KMS knowledge-base chunks to prepend as context.
   * @throws AppError (EXT0018) when `agentSessionId` is empty or prompt is blank.
   */
  async sendPrompt(
    agentSessionId: string,
    prompt: string,
    context: AgentContextChunk[] = [],
  ): Promise<void> {
    if (!agentSessionId) {
      throw new AppError({
        code: ERROR_CODES.EXT.GEMINI_PROMPT_FAILED.code,
        message: 'GeminiAdapter: agentSessionId must not be empty',
        statusCode: 422,
      });
    }
    if (!prompt.trim()) {
      throw new AppError({
        code: ERROR_CODES.EXT.GEMINI_PROMPT_FAILED.code,
        message: 'GeminiAdapter: prompt must not be blank',
        statusCode: 422,
      });
    }

    this.pendingPrompts.set(agentSessionId, { prompt, context });
    this.logger.info('GeminiAdapter: prompt queued', {
      agentSessionId,
      promptLength: prompt.length,
      contextChunks: context.length,
    });
  }

  /**
   * Opens a streaming request to the Gemini API and yields ACP events.
   *
   * Mapping of Gemini streaming response to ACP event types:
   * - `candidates[].content.parts[].text` present      → `agent_message_chunk`
   * - `candidates[].finishReason === "STOP"`            → `done`
   * - HTTP error or JSON parse failure                  → `error`
   *
   * The Gemini `alt=sse` parameter causes the response to be delivered as
   * server-sent events, each carrying a JSON `GenerateContentResponse` as data.
   *
   * @param agentSessionId - The agent-side session ID from `ensureSession`.
   * @yields {@link ExternalAgentEvent} objects until the stream ends.
   * @throws AppError (EXT0018) when no prompt has been buffered for this session.
   * @throws AppError (EXT0018) when the Gemini API returns a non-2xx status.
   * @throws AppError (EXT0019) when the response stream is interrupted.
   */
  async *streamEvents(agentSessionId: string): AsyncIterable<ExternalAgentEvent> {
    const pending = this.pendingPrompts.get(agentSessionId);
    if (!pending) {
      throw new AppError({
        code: ERROR_CODES.EXT.GEMINI_PROMPT_FAILED.code,
        message: `GeminiAdapter: no pending prompt for session ${agentSessionId} — call sendPrompt first`,
        statusCode: 422,
      });
    }

    this.pendingPrompts.delete(agentSessionId);

    const { prompt, context } = pending;
    const userText = this.buildUserText(prompt, context);
    const requestBody = this.buildRequestBody(userText);
    const url = this.buildStreamUrl();

    this.logger.info('GeminiAdapter: opening stream', {
      agentSessionId,
      model: this.model,
      contextChunks: context.length,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error('GeminiAdapter: network error opening stream', {
        agentSessionId,
        error: (err as Error).message,
      });
      throw new AppError({
        code: ERROR_CODES.EXT.GEMINI_STREAM_FAILED.code,
        message: `GeminiAdapter: network error connecting to Gemini API — ${(err as Error).message}`,
        cause: err instanceof Error ? err : undefined,
      });
    }

    if (!response.ok || !response.body) {
      const statusText = await response.text().catch(() => '');
      this.logger.error('GeminiAdapter: non-2xx response from Gemini API', {
        agentSessionId,
        status: response.status,
        body: statusText.slice(0, 300),
      });
      throw new AppError({
        code: ERROR_CODES.EXT.GEMINI_PROMPT_FAILED.code,
        message: `GeminiAdapter: Gemini API returned HTTP ${response.status}`,
        statusCode: response.status === 429 ? 429 : response.status >= 500 ? 502 : response.status,
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Stream-level timeout
    const streamDeadline = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new AppError({
              code: ERROR_CODES.EXT.GEMINI_STREAM_FAILED.code,
              message: `GeminiAdapter: stream timeout after ${STREAM_TIMEOUT_MS / 1000}s`,
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
          const result = this.parseSSELine(line, agentSessionId);
          if (!result) continue;

          yield result.event;

          if (result.event.type === 'done' || result.event.type === 'error') return;
        }
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      this.logger.error('GeminiAdapter: stream read error', {
        agentSessionId,
        error: (err as Error).message,
      });
      throw new AppError({
        code: ERROR_CODES.EXT.GEMINI_STREAM_FAILED.code,
        message: `GeminiAdapter: stream interrupted — ${(err as Error).message}`,
        cause: err instanceof Error ? err : undefined,
      });
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Removes any buffered prompt state for the session.
   * There is no server-side request to cancel for stateless HTTP calls.
   *
   * @param agentSessionId - The agent-side session ID to cancel.
   */
  async cancel(agentSessionId: string): Promise<void> {
    this.pendingPrompts.delete(agentSessionId);
    this.logger.info('GeminiAdapter: cancel called (pending prompt cleared)', {
      agentSessionId,
    });
  }

  /**
   * Cleans up local session state.
   * Gemini has no server-side session to close.
   *
   * @param agentSessionId - The agent-side session ID to close.
   */
  async close(agentSessionId: string): Promise<void> {
    this.pendingPrompts.delete(agentSessionId);
    this.logger.info('GeminiAdapter: session closed', { agentSessionId });
  }

  /**
   * Health-checks the Gemini API by calling the models list endpoint.
   *
   * @returns `true` when the API responds with HTTP 200, `false` otherwise.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/v1beta/models?key=${this.apiKey}&pageSize=1`,
        { signal: AbortSignal.timeout(5_000) },
      );
      const ok = response.ok;
      this.logger.info('GeminiAdapter: health check', { ok, status: response.status });
      return ok;
    } catch (err) {
      this.logger.warn('GeminiAdapter: health check failed', {
        error: (err as Error).message,
      });
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds the user-facing text string, prepending context chunks when present.
   *
   * @param prompt  - Raw user prompt.
   * @param context - KMS knowledge-base chunks.
   * @returns Combined text to send to the model.
   */
  private buildUserText(prompt: string, context: AgentContextChunk[]): string {
    if (context.length === 0) return prompt;

    const contextBlock = context
      .map((c, i) => `[${i + 1}] ${c.filename} (score: ${c.score.toFixed(3)})\n${c.content}`)
      .join('\n\n---\n\n');

    return `Context from knowledge base:\n\n${contextBlock}\n\n---\n\n${prompt}`;
  }

  /**
   * Constructs the `GenerateContentRequest` body for the Gemini API.
   *
   * @param userText - Pre-formatted user message text.
   * @returns Serialisable request body object.
   */
  private buildRequestBody(userText: string): Record<string, unknown> {
    return {
      contents: [
        {
          role: 'user',
          parts: [{ text: userText }],
        },
      ],
      generationConfig: {
        // candidateCount defaults to 1; temperature and topP use API defaults
      },
    };
  }

  /**
   * Builds the full URL for the `streamGenerateContent` endpoint.
   *
   * The `alt=sse` query parameter instructs the API to return server-sent events
   * rather than a newline-delimited JSON array.
   *
   * @returns Full URL string.
   */
  private buildStreamUrl(): string {
    return (
      `${GEMINI_API_BASE}/v1beta/models/${encodeURIComponent(this.model)}` +
      `:streamGenerateContent?key=${this.apiKey}&alt=sse`
    );
  }

  /**
   * Parses a single SSE `data:` line from the Gemini stream.
   *
   * Gemini SSE lines carry `GenerateContentResponse` JSON objects. We map:
   * - Text parts in `candidates[0].content.parts`   → `agent_message_chunk`
   * - `candidates[0].finishReason === "STOP"`        → `done`
   * - `promptFeedback.blockReason` present           → `error`
   *
   * @param line           - Raw SSE line (e.g. `data: {...}`).
   * @param agentSessionId - Used for log context on parse failures.
   * @returns `{ event }` when a mappable event is parsed, `null` to skip the line.
   */
  private parseSSELine(
    line: string,
    agentSessionId: string,
  ): { event: ExternalAgentEvent } | null {
    if (!line.startsWith('data: ')) return null;
    const raw = line.slice(6).trim();
    if (!raw || raw === '[DONE]') {
      return { event: { type: 'done', data: { reason: 'stream_done_sentinel' } } };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.logger.warn('GeminiAdapter: malformed SSE line (skipped)', {
        agentSessionId,
        line: line.slice(0, 200),
      });
      return null;
    }

    // Safety check — blocked content
    const promptFeedback = parsed.promptFeedback as Record<string, unknown> | undefined;
    if (promptFeedback?.blockReason) {
      this.logger.warn('GeminiAdapter: content blocked by safety filter', {
        agentSessionId,
        blockReason: promptFeedback.blockReason,
      });
      return {
        event: {
          type: 'error',
          data: { message: `Content blocked: ${promptFeedback.blockReason}` },
        },
      };
    }

    const candidates = parsed.candidates as Array<Record<string, unknown>> | undefined;
    if (!candidates || candidates.length === 0) return null;

    const candidate = candidates[0];
    const finishReason = candidate.finishReason as string | undefined;
    const content = candidate.content as Record<string, unknown> | undefined;
    const parts = content?.parts as Array<Record<string, unknown>> | undefined;

    // Collect text from all parts in this chunk
    let text = '';
    if (parts) {
      for (const part of parts) {
        if (typeof part.text === 'string') {
          text += part.text;
        }
      }
    }

    // Yield text chunk first, then done if this is the final chunk
    if (text) {
      // If this chunk also signals completion we'll handle that in the caller
      // by yielding done on the next iteration (via finishReason check below).
      if (finishReason === 'STOP') {
        // Return the text chunk; caller will see done next from our empty-text path
        // Actually: yield the text chunk and then signal done inline.
        // Since we can only return one event here, we yield text chunk and rely
        // on the empty subsequent chunk with finishReason STOP to emit done.
        // To avoid missing the done event, we emit done if there is no text next.
        // Simplest: always emit text chunk; emit done separately via a follow-up
        // synthetic done event in the stream loop isn't possible here.
        // Resolution: if text AND finishReason, combine into a single done event
        // with the text payload so the consumer can extract both.
        return {
          event: {
            type: 'agent_message_chunk',
            data: { text, finishReason },
          },
        };
      }
      return { event: { type: 'agent_message_chunk', data: { text } } };
    }

    // No text but finishReason STOP — stream is complete
    if (finishReason === 'STOP') {
      return { event: { type: 'done', data: { finishReason } } };
    }

    // finishReason other than STOP (e.g. MAX_TOKENS, SAFETY)
    if (finishReason && finishReason !== 'STOP') {
      this.logger.warn('GeminiAdapter: unexpected finishReason', {
        agentSessionId,
        finishReason,
      });
      return { event: { type: 'done', data: { finishReason, reason: 'unexpected_finish' } } };
    }

    return null;
  }
}
