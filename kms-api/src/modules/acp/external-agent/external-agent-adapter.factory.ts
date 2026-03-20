import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../logger/logger.service';
import { AppError } from '../../../errors/types/app-error';
import { ERROR_CODES } from '../../../errors/error-codes';
import { IExternalAgentAdapter, ExternalAgentRegistryEntry } from './external-agent.interface';
import { HttpAcpAdapter } from './http-acp.adapter';
import { StdioAcpAdapter } from './stdio-acp.adapter';
import { HttpCodexAdapter } from './codex.adapter';
import { GeminiAdapter } from './gemini.adapter';

/** Maximum concurrent stdio subprocess sessions per user (ADR-0023). */
const MAX_STDIO_SESSIONS_PER_USER = 3;

/** Static registry of supported external agents. */
const EXTERNAL_AGENT_REGISTRY: Record<string, ExternalAgentRegistryEntry> = {
  'claude-api': {
    agentId: 'claude-api',
    name: 'Claude API (Anthropic)',
    transport: 'http',
    baseUrl: process.env.CLAUDE_API_BASE_URL ?? 'https://api.anthropic.com',
  },
  'claude-code': {
    agentId: 'claude-code',
    name: 'Claude Code (stdio)',
    transport: 'stdio',
    command: 'npx -y @zed-industries/claude-agent-acp',
  },
  /**
   * Codex uses a dedicated HttpCodexAdapter that calls the OpenAI Responses API
   * directly with SSE streaming. Transport is recorded as "http" so the stdio
   * subprocess pool cap is not applied.
   */
  codex: {
    agentId: 'codex',
    name: 'OpenAI Codex / o4-mini (HTTP)',
    transport: 'http',
  },
  /**
   * Gemini uses a dedicated GeminiAdapter that calls the Generative Language API
   * directly with SSE streaming. Transport is recorded as "http".
   */
  gemini: {
    agentId: 'gemini',
    name: 'Google Gemini (HTTP)',
    transport: 'http',
  },
  'custom-acp': {
    agentId: 'custom-acp',
    name: 'Custom ACP-over-HTTP Agent',
    transport: 'http',
    baseUrl: process.env.CUSTOM_ACP_BASE_URL ?? 'http://localhost:9000',
  },
};

/**
 * ExternalAgentAdapterFactory resolves the correct IExternalAgentAdapter
 * for a given agentId based on the static registry.
 *
 * Enforces the per-user stdio process pool cap (ADR-0023: max 3 per user).
 * Tracks active stdio sessions per user in an in-memory map; this is
 * sufficient for single-instance deployments. For multi-instance, move the
 * counter to Redis with a TTL equal to the ACP session TTL.
 *
 * @example
 * ```typescript
 * const adapter = factory.create('claude-code', userId);
 * const agentSessionId = await adapter.ensureSession(kmsSessionId, userId);
 * ```
 */
@Injectable()
export class ExternalAgentAdapterFactory {
  /** Maps userId → count of active stdio subprocess sessions. */
  private readonly stdioSessionCounts = new Map<string, number>();
  private readonly logger: AppLogger;

  constructor(private readonly appLogger: AppLogger) {
    this.logger = appLogger.child({ context: ExternalAgentAdapterFactory.name });
  }

  /**
   * Creates an IExternalAgentAdapter for the requested agent.
   *
   * @param agentId - Agent identifier from the registry (e.g. "claude-code", "claude-api")
   * @param userId  - The authenticated user's UUID — used to enforce the stdio pool cap
   * @returns A new adapter instance bound to the agent's transport
   * @throws AppError (404) when agentId is not in the registry
   * @throws AppError (429) when the user has reached the stdio subprocess cap
   */
  create(agentId: string, userId: string): IExternalAgentAdapter {
    const entry = EXTERNAL_AGENT_REGISTRY[agentId];
    if (!entry) {
      throw new AppError({
        code: ERROR_CODES.EXT.INVALID_RESPONSE.code,
        message: `Unknown agent ID: ${agentId}. Supported agents: ${Object.keys(EXTERNAL_AGENT_REGISTRY).join(', ')}`,
        statusCode: 404,
      });
    }

    if (entry.transport === 'stdio') {
      this.enforceStdioPoolCap(userId, agentId);
    }

    this.logger.info('ExternalAgentAdapterFactory: creating adapter', {
      agentId,
      transport: entry.transport,
      userId,
    });

    // Dedicated adapters for Codex and Gemini — resolved before the generic
    // HTTP/stdio dispatch so they use their own credential + streaming logic.
    if (agentId === 'codex') {
      return new HttpCodexAdapter(this.appLogger);
    }

    if (agentId === 'gemini') {
      return new GeminiAdapter(this.appLogger);
    }

    if (entry.transport === 'http') {
      return new HttpAcpAdapter(entry, this.appLogger);
    }

    const adapter = new StdioAcpAdapter(entry, this.appLogger);
    this.incrementStdioCount(userId);

    // Wrap close() to decrement the pool count when the session ends
    const originalClose = adapter.close.bind(adapter);
    adapter.close = async (sid: string) => {
      await originalClose(sid);
      this.decrementStdioCount(userId, agentId);
    };

    return adapter;
  }

  /**
   * Returns all registered agent IDs and their metadata.
   * Used by the ACP /initialize endpoint to advertise available agents.
   */
  listAgents(): ExternalAgentRegistryEntry[] {
    return Object.values(EXTERNAL_AGENT_REGISTRY);
  }

  // ---------------------------------------------------------------------------
  // Private helpers — stdio pool management
  // ---------------------------------------------------------------------------

  private enforceStdioPoolCap(userId: string, agentId: string): void {
    const current = this.stdioSessionCounts.get(userId) ?? 0;
    if (current >= MAX_STDIO_SESSIONS_PER_USER) {
      this.logger.warn('ExternalAgentAdapterFactory: stdio pool cap reached', {
        userId,
        agentId,
        activeCount: current,
        cap: MAX_STDIO_SESSIONS_PER_USER,
      });
      throw new AppError({
        code: ERROR_CODES.EXT.SERVICE_UNAVAILABLE.code,
        message: `Maximum ${MAX_STDIO_SESSIONS_PER_USER} concurrent agent subprocess sessions reached. Close an existing session before starting a new one.`,
        statusCode: 429,
      });
    }
  }

  private incrementStdioCount(userId: string): void {
    const current = this.stdioSessionCounts.get(userId) ?? 0;
    this.stdioSessionCounts.set(userId, current + 1);
  }

  private decrementStdioCount(userId: string, agentId: string): void {
    const current = this.stdioSessionCounts.get(userId) ?? 0;
    const next = Math.max(0, current - 1);
    this.stdioSessionCounts.set(userId, next);
    this.logger.info('ExternalAgentAdapterFactory: stdio session closed', {
      userId,
      agentId,
      remainingCount: next,
    });
  }
}
