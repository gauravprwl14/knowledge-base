import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../cache/cache.service';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { v4 as uuidv4 } from 'uuid';

/** Persisted data for an ACP session. */
export interface AcpSession {
  sessionId: string;
  userId: string;
  createdAt: string;
  lastTouchedAt: string;
  cwd?: string;
  /**
   * Spawn depth of this session.
   * 0 = created directly by a user; 1 = spawned by WorkflowEngine from a user session;
   * 2 = spawned by an agent at depth 1 (maximum — enforced by ADR-0022).
   */
  sessionDepth?: number;
  /**
   * Session ID of the parent session that spawned this one (ADR-0022).
   * Present only when sessionDepth >= 1.
   */
  parentSessionId?: string;
}

const SESSION_KEY_PREFIX = 'kms:acp:session:';

/**
 * AcpSessionStore manages ACP sessions in Redis.
 *
 * Sessions are stored as JSON with a configurable TTL.
 * Every get() call slides the TTL (rolling window expiry).
 */
@Injectable()
export class AcpSessionStore {
  private readonly logger: AppLogger;
  private readonly ttlSeconds: number;

  constructor(
    private readonly cache: CacheService,
    private readonly config: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.child({ context: AcpSessionStore.name });
    this.ttlSeconds = parseInt(this.config.get<string>('ACP_SESSION_TTL_SECONDS') ?? '3600', 10);
  }

  /**
   * Creates a new session for the given user.
   *
   * @param userId - Authenticated user's UUID from JwtAuthGuard.
   * @param cwd - Optional working directory hint from the client.
   * @returns The newly created AcpSession.
   */
  async create(userId: string, cwd?: string): Promise<AcpSession> {
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    const session: AcpSession = {
      sessionId,
      userId,
      createdAt: now,
      lastTouchedAt: now,
      cwd,
    };
    await this.cache.set(this.key(sessionId), session, this.ttlSeconds);
    this.logger.info('ACP session created', { sessionId, userId });
    return session;
  }

  /**
   * Retrieves a session by ID and resets its TTL (sliding window).
   * Throws EXT0012 if the session does not exist or has expired.
   *
   * @param sessionId - The session UUID.
   * @returns The AcpSession.
   */
  async get(sessionId: string): Promise<AcpSession> {
    const session = await this.cache.get<AcpSession>(this.key(sessionId));
    if (!session) {
      throw new AppError({
        code: ERROR_CODES.EXT.ACP_SESSION_NOT_FOUND.code,
        message: `ACP session ${sessionId} not found or expired`,
        statusCode: 404,
      });
    }
    session.lastTouchedAt = new Date().toISOString();
    await this.cache.set(this.key(sessionId), session, this.ttlSeconds);
    return session;
  }

  /**
   * Deletes a session from Redis.
   *
   * @param sessionId - The session UUID to delete.
   */
  async delete(sessionId: string): Promise<void> {
    await this.cache.del(this.key(sessionId));
    this.logger.info('ACP session deleted', { sessionId });
  }

  /**
   * Updates a session with spawn metadata (parent session ID and depth).
   * Called by AcpToolRegistry.kmsSpawnAgent() after a child session is created.
   *
   * @param sessionId      - The child session UUID to update.
   * @param metadata       - Spawn metadata to merge into the session.
   */
  async setSpawnMetadata(
    sessionId: string,
    metadata: { parentSessionId: string; sessionDepth: number },
  ): Promise<void> {
    const session = await this.get(sessionId);
    const updated: AcpSession = {
      ...session,
      parentSessionId: metadata.parentSessionId,
      sessionDepth: metadata.sessionDepth,
    };
    await this.cache.set(this.key(sessionId), updated, this.ttlSeconds);
    this.logger.info('ACP session spawn metadata set', {
      sessionId,
      parentSessionId: metadata.parentSessionId,
      sessionDepth: metadata.sessionDepth,
    });
  }

  private key(sessionId: string): string {
    return `${SESSION_KEY_PREFIX}${sessionId}`;
  }
}
