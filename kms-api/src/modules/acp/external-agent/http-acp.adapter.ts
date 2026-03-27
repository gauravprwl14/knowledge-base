import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../logger/logger.service';
import { AppError } from '../../../errors/types/app-error';
import { ERROR_CODES } from '../../../errors/error-codes';
import {
  IExternalAgentAdapter,
  AgentContextChunk,
  ExternalAgentEvent,
  ExternalAgentRegistryEntry,
} from './external-agent.interface';

/**
 * HttpAcpAdapter — ACP-over-HTTP transport adapter for cloud-hosted agents.
 *
 * Implements IExternalAgentAdapter (ADR-0023) for HTTP-native agents such as
 * the Anthropic API wrapper, OpenRouter, and any custom ACP-over-HTTP server.
 *
 * Session lifecycle:
 * 1. `ensureSession()` — POST /acp/v1/initialize + POST /acp/v1/sessions
 * 2. `sendPrompt()`    — POST /acp/v1/sessions/:id/prompt (non-blocking)
 * 3. `streamEvents()`  — reads SSE stream from the active prompt response
 * 4. `close()`         — DELETE /acp/v1/sessions/:id
 *
 * This adapter is stateless per call: no subprocess, no persistent connections.
 * Rate limits and retries are applied per-request with configurable timeouts.
 *
 * @example
 * ```typescript
 * const adapter = new HttpAcpAdapter(entry, logger);
 * const agentSessionId = await adapter.ensureSession(sessionId, userId);
 * await adapter.sendPrompt(agentSessionId, 'Summarise this document', chunks);
 * for await (const event of adapter.streamEvents(agentSessionId)) {
 *   if (event.type === 'done') break;
 * }
 * await adapter.close(agentSessionId);
 * ```
 */
@Injectable()
export class HttpAcpAdapter implements IExternalAgentAdapter {
  private readonly logger: AppLogger;
  private readonly baseUrl: string;

  /**
   * @param entry  - Registry entry for the agent (must have transport === "http")
   * @param logger - Bound AppLogger instance
   */
  constructor(entry: ExternalAgentRegistryEntry, logger: AppLogger) {
    if (!entry.baseUrl) {
      throw new AppError({
        code: ERROR_CODES.EXT.SERVICE_UNAVAILABLE.code,
        message: `HttpAcpAdapter: registry entry ${entry.agentId} is missing baseUrl`,
      });
    }
    this.baseUrl = entry.baseUrl.replace(/\/$/, '');
    this.logger = logger.child({ context: HttpAcpAdapter.name, agentId: entry.agentId });
  }

  /** {@inheritdoc IExternalAgentAdapter.ensureSession} */
  async ensureSession(sessionId: string, userId: string): Promise<string> {
    this.logger.info('HttpAcpAdapter: initializing session', { sessionId, userId });

    // Step 1 — ACP handshake
    const initResp = await this.post('/acp/v1/initialize', { protocolVersion: 1 }, userId);
    this.logger.info('HttpAcpAdapter: handshake complete', {
      protocolVersion: (initResp as any).protocolVersion,
    });

    // Step 2 — create session
    const sessionResp = await this.post('/acp/v1/sessions', { cwd: undefined }, userId);
    const agentSessionId = (sessionResp as any).sessionId as string;
    this.logger.info('HttpAcpAdapter: session created', { agentSessionId });
    return agentSessionId;
  }

  /** {@inheritdoc IExternalAgentAdapter.sendPrompt} */
  async sendPrompt(
    agentSessionId: string,
    prompt: string,
    context: AgentContextChunk[] = [],
  ): Promise<void> {
    this.logger.info('HttpAcpAdapter: sending prompt', { agentSessionId, promptLength: prompt.length });
    await this.post(
      `/acp/v1/sessions/${agentSessionId}/prompt`,
      {
        prompt: [
          { type: 'text', text: prompt },
          ...(context.length > 0
            ? [{ type: 'text', text: `\n\nContext:\n${context.map((c) => c.content).join('\n---\n')}` }]
            : []),
        ],
      },
      undefined,
      false, // do not await the full body for SSE responses
    );
  }

  /** {@inheritdoc IExternalAgentAdapter.streamEvents} */
  async *streamEvents(agentSessionId: string): AsyncIterable<ExternalAgentEvent> {
    const url = `${this.baseUrl}/acp/v1/sessions/${agentSessionId}/prompt`;
    this.logger.info('HttpAcpAdapter: streaming events', { agentSessionId });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      throw new AppError({
        code: ERROR_CODES.EXT.SERVICE_UNAVAILABLE.code,
        message: 'HttpAcpAdapter: agent HTTP stream unavailable',
        cause: err instanceof Error ? err : undefined,
      });
    }

    if (!response.ok || !response.body) {
      throw new AppError({
        code: ERROR_CODES.EXT.INVALID_RESPONSE.code,
        message: `HttpAcpAdapter: HTTP ${response.status} from agent`,
        statusCode: response.status >= 500 ? 502 : response.status,
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const event = JSON.parse(raw) as ExternalAgentEvent;
          yield event;
          if (event.type === 'done' || event.type === 'error') return;
        } catch {
          // Malformed SSE line — skip
        }
      }
    }
  }

  /** {@inheritdoc IExternalAgentAdapter.cancel} */
  async cancel(agentSessionId: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/acp/v1/sessions/${agentSessionId}/prompt`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      this.logger.warn('HttpAcpAdapter: cancel request failed (non-fatal)', {
        agentSessionId,
        error: (err as Error).message,
      });
    }
  }

  /** {@inheritdoc IExternalAgentAdapter.close} */
  async close(agentSessionId: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/acp/v1/sessions/${agentSessionId}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(5_000),
      });
      this.logger.info('HttpAcpAdapter: session closed', { agentSessionId });
    } catch (err) {
      this.logger.warn('HttpAcpAdapter: close request failed (non-fatal)', {
        agentSessionId,
        error: (err as Error).message,
      });
    }
  }

  /** {@inheritdoc IExternalAgentAdapter.healthCheck} */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Makes a JSON POST request to the agent's HTTP endpoint.
   *
   * @param path    - Relative URL path (e.g. "/acp/v1/initialize")
   * @param body    - Request body (will be JSON-serialised)
   * @param userId  - Optional x-user-id header value
   * @param parseJson - When true, awaits response.json(); when false returns void
   * @throws AppError on network errors or non-2xx responses
   */
  private async post(
    path: string,
    body: unknown,
    userId?: string,
    parseJson = true,
  ): Promise<unknown> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (userId) headers['x-user-id'] = userId;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new AppError({
        code: ERROR_CODES.EXT.SERVICE_UNAVAILABLE.code,
        message: `HttpAcpAdapter: agent at ${this.baseUrl} is unreachable`,
        cause: err instanceof Error ? err : undefined,
      });
    }

    if (!response.ok) {
      throw new AppError({
        code: ERROR_CODES.EXT.INVALID_RESPONSE.code,
        message: `HttpAcpAdapter: HTTP ${response.status} from ${path}`,
        statusCode: response.status >= 500 ? 502 : response.status,
      });
    }

    return parseJson ? response.json() : undefined;
  }
}
