import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { AppLogger } from '../../logger/logger.service';
import { AcpSessionStore, AcpSession } from './acp-session.store';
import { AcpToolRegistry } from './acp-tool.registry';
import { AcpEventEmitter } from './acp-event.emitter';
import { AnthropicAdapter } from './external-agent/anthropic.adapter';
import { PromptSessionDto } from './dto/prompt-session.dto';
import { CreateSessionDto } from './dto/create-session.dto';

/**
 * AcpService orchestrates the ACP prompt lifecycle:
 * 1. Validate session
 * 2. Extract question from prompt parts
 * 3. Call kms_search tool
 * 4. Stream grounded Claude response back via SSE
 */
@Injectable()
export class AcpService {
  private readonly logger: AppLogger;

  constructor(
    private readonly sessionStore: AcpSessionStore,
    private readonly toolRegistry: AcpToolRegistry,
    private readonly anthropicAdapter: AnthropicAdapter,
    logger: AppLogger,
  ) {
    this.logger = logger.child({ context: AcpService.name });
  }

  /**
   * Creates a new ACP session for the authenticated user.
   *
   * @param userId - The authenticated user's UUID.
   * @param dto - CreateSession payload (cwd hint).
   * @returns The created session object.
   */
  async createSession(userId: string, dto: CreateSessionDto): Promise<AcpSession> {
    return this.sessionStore.create(userId, dto.cwd);
  }

  /**
   * Closes an ACP session by deleting it from Redis.
   *
   * @param sessionId - Session UUID to delete.
   */
  async closeSession(sessionId: string): Promise<void> {
    return this.sessionStore.delete(sessionId);
  }

  /**
   * Runs the full prompt flow and returns an Observable<MessageEvent> for SSE.
   *
   * The Observable is hot: it starts immediately and the caller subscribes
   * via NestJS @Sse to forward events to the HTTP client.
   *
   * @param sessionId - The session UUID from the route param.
   * @param dto - The prompt payload.
   * @returns RxJS Observable of SSE MessageEvents.
   */
  runPrompt(sessionId: string, dto: PromptSessionDto): Observable<MessageEvent> {
    const emitter = new AcpEventEmitter();

    this.executePromptPipeline(sessionId, dto, emitter).catch((err: Error) => {
      this.logger.error('Prompt pipeline error', { sessionId, error: err.message });
      emitter.emitError(err.message);
    });

    return emitter.subject.asObservable();
  }

  private async executePromptPipeline(
    sessionId: string,
    dto: PromptSessionDto,
    emitter: AcpEventEmitter,
  ): Promise<void> {
    const session = await this.sessionStore.get(sessionId);

    const question = dto.prompt
      .filter(p => p.type === 'text')
      .map(p => p.text)
      .join(' ')
      .trim();

    if (!question) {
      emitter.emitError('Prompt contains no text content');
      return;
    }

    this.logger.info('Executing ACP prompt pipeline', {
      sessionId,
      userId: session.userId,
      questionLength: question.length,
    });

    emitter.emitToolCallStart('kms_search', { query: question, mode: 'hybrid', limit: 5 });

    const searchResponse = await this.toolRegistry.kmsSearch(question, session.userId, 'hybrid', 5);

    emitter.emitToolCallResult('kms_search', searchResponse.results.length);

    this.logger.info('kms_search completed', {
      sessionId,
      resultCount: searchResponse.results.length,
      took_ms: searchResponse.took_ms,
    });

    await this.anthropicAdapter.streamAnswer(question, searchResponse.results, emitter);
  }
}
