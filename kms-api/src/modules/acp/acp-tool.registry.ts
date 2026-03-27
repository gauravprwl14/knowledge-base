import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { KmsSearchResponse } from './external-agent/external-agent.types';
import { ExternalAgentAdapterFactory } from './external-agent/external-agent-adapter.factory';
import { AcpSessionStore } from './acp-session.store';

/** Tool descriptor returned in the /initialize response. */
export const ACP_TOOLS = [
  {
    name: 'kms_search',
    description: 'Search the KMS knowledge base. Returns up to `limit` ranked chunks.',
    parameters: {
      query: { type: 'string', description: 'The search query' },
      mode: {
        type: 'string',
        enum: ['keyword', 'semantic', 'hybrid'],
        default: 'hybrid',
        description: 'Search strategy',
      },
      limit: {
        type: 'number',
        default: 5,
        description: 'Maximum number of results (1–20)',
      },
    },
  },
  {
    name: 'kms_spawn_agent',
    description:
      'Spawn an external agent (Claude Code, Codex, Gemini, or a custom ACP-over-HTTP agent) ' +
      'to handle a sub-task. The calling agent blocks until the spawned agent returns a result. ' +
      'Maximum spawn depth is 2 (per ADR-0022). Sub-agents at depth 2 cannot call kms_spawn_agent.',
    parameters: {
      agentId: {
        type: 'string',
        enum: ['claude-code', 'claude-api', 'codex', 'gemini', 'custom-acp'],
        description: 'ID of the agent to spawn from the KMS agent registry',
      },
      prompt: {
        type: 'string',
        description: 'The prompt to send to the spawned agent',
      },
      mode: {
        type: 'string',
        enum: ['sequential', 'parallel'],
        default: 'sequential',
        description:
          '"sequential" blocks until result is available; "parallel" fires and returns a trackingId',
      },
    },
  },
];

/** Maximum ACP spawn depth enforced per ADR-0022. */
const MAX_SPAWN_DEPTH = 2;

/** Error code emitted when spawn depth limit is exceeded (ADR-0022). */
const SPAWN_DEPTH_ERROR_CODE = 'KBWRK0020';

/**
 * AcpToolRegistry provides the implementation for each registered ACP tool.
 *
 * Tools exposed:
 * - `kms_search`      — hybrid search over the knowledge base (Phase 1)
 * - `kms_spawn_agent` — spawn an external agent as a sub-task (Phase 2 / Sprint 4)
 */
@Injectable()
export class AcpToolRegistry {
  private readonly logger: AppLogger;
  private readonly searchApiUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly adapterFactory: ExternalAgentAdapterFactory,
    private readonly sessionStore: AcpSessionStore,
    logger: AppLogger,
  ) {
    this.logger = logger.child({ context: AcpToolRegistry.name });
    this.searchApiUrl = this.config.get<string>('SEARCH_API_URL') ?? 'http://localhost:8001';
  }

  /**
   * Executes the kms_search tool.
   *
   * Calls GET /search on search-api with query, mode, limit.
   * Forwards userId via x-user-id header for user-scoped results.
   *
   * @param query - The search string.
   * @param userId - The authenticated user's UUID (from ACP session).
   * @param mode - Search strategy: keyword, semantic, or hybrid.
   * @param limit - Max number of results (capped at 20).
   * @returns KmsSearchResponse with ranked result chunks.
   */
  async kmsSearch(
    query: string,
    userId: string,
    mode: 'keyword' | 'semantic' | 'hybrid' = 'hybrid',
    limit = 5,
  ): Promise<KmsSearchResponse> {
    const cappedLimit = Math.min(Math.max(limit, 1), 20);
    const params = new URLSearchParams({
      q: query,
      mode,
      limit: String(cappedLimit),
    });

    const url = `${this.searchApiUrl}/search?${params.toString()}`;
    this.logger.info('kms_search executing', { url, mode, limit: cappedLimit, userId });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      this.logger.error('search-api unreachable from ACP tool', {
        error: (err as Error).message,
      });
      throw new AppError({
        code: ERROR_CODES.EXT.SERVICE_UNAVAILABLE.code,
        message: 'Search service unavailable',
        cause: err instanceof Error ? err : undefined,
      });
    }

    if (!response.ok) {
      throw new AppError({
        code: ERROR_CODES.EXT.INVALID_RESPONSE.code,
        message: `Search service returned HTTP ${response.status}`,
        statusCode: response.status >= 500 ? 502 : response.status,
      });
    }

    return response.json() as Promise<KmsSearchResponse>;
  }

  /**
   * Executes the kms_spawn_agent tool.
   *
   * Enforces the depth-2 limit from ADR-0022: if the calling session is already
   * at depth 2, the spawn is rejected with KBWRK0020. Otherwise, a new child ACP
   * session is created at depth+1, the prompt is sent to the external agent, and
   * the result is collected synchronously (mode === "sequential") or a trackingId
   * is returned immediately (mode === "parallel").
   *
   * @param parentSessionId - The ACP session ID of the calling agent.
   * @param userId          - Authenticated user UUID (scopes subprocess pool cap).
   * @param agentId         - Target agent from the registry (e.g. "claude-code").
   * @param prompt          - Prompt to send to the spawned agent.
   * @param mode            - "sequential" (blocking) or "parallel" (fire-and-track).
   * @returns SpawnResult with the agent's textual reply (sequential) or trackingId (parallel).
   * @throws AppError (KBWRK0020) if the spawn depth limit would be exceeded.
   */
  async kmsSpawnAgent(
    parentSessionId: string,
    userId: string,
    agentId: string,
    prompt: string,
    mode: 'sequential' | 'parallel' = 'sequential',
  ): Promise<{ reply?: string; trackingId?: string; spawnedSessionId: string }> {
    // Load parent session to check spawn depth
    const parentSession = await this.sessionStore.get(parentSessionId);
    const parentDepth = parentSession.sessionDepth ?? 0;

    if (parentDepth >= MAX_SPAWN_DEPTH) {
      this.logger.warn('kms_spawn_agent: depth limit exceeded', {
        parentSessionId,
        parentDepth,
        maxDepth: MAX_SPAWN_DEPTH,
        agentId,
      });
      throw new AppError({
        code: SPAWN_DEPTH_ERROR_CODE,
        message: `Agent spawn depth limit (${MAX_SPAWN_DEPTH}) exceeded. Sub-agents at depth ${MAX_SPAWN_DEPTH} cannot spawn further agents.`,
        statusCode: 422,
      });
    }

    // Create a child ACP session for the spawned agent
    const childSession = await this.sessionStore.create(userId, parentSession.cwd);
    // Record the parent-child relationship and depth
    await this.sessionStore.setSpawnMetadata(childSession.sessionId, {
      parentSessionId,
      sessionDepth: parentDepth + 1,
    });

    this.logger.info('kms_spawn_agent: spawning agent', {
      parentSessionId,
      childSessionId: childSession.sessionId,
      agentId,
      depth: parentDepth + 1,
      mode,
    });

    const adapter = this.adapterFactory.create(agentId, userId);
    const agentSessionId = await adapter.ensureSession(childSession.sessionId, userId);
    await adapter.sendPrompt(agentSessionId, prompt);

    if (mode === 'parallel') {
      // Fire-and-track: return immediately; caller can poll by childSessionId
      return { trackingId: childSession.sessionId, spawnedSessionId: childSession.sessionId };
    }

    // Sequential: collect full reply before returning
    let reply = '';
    for await (const event of adapter.streamEvents(agentSessionId)) {
      if (event.type === 'agent_message_chunk') {
        reply += (event.data as any)?.text ?? '';
      }
      if (event.type === 'done' || event.type === 'error') break;
    }

    await adapter.close(agentSessionId);
    await this.sessionStore.delete(childSession.sessionId);

    this.logger.info('kms_spawn_agent: agent completed', {
      parentSessionId,
      childSessionId: childSession.sessionId,
      agentId,
      replyLength: reply.length,
    });

    return { reply, spawnedSessionId: childSession.sessionId };
  }
}
