import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';

/** Payload for starting a new agent run. */
export interface CreateRunDto {
  /** User query / message to send to the RAG agent */
  message: string;
  /** Optional session ID for multi-turn conversation */
  sessionId?: string;
  /** Optional collection IDs to scope the RAG search */
  collectionIds?: string[];
}

/** Summary information about an agent run. */
export interface RunInfo {
  runId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
}

/**
 * AgentsService orchestrates ACP (Agent Communication Protocol) calls to
 * the `rag-service` Python FastAPI microservice running on port 8002.
 *
 * ACP REST endpoints proxied:
 * - `POST   /runs`              — create a new agent run
 * - `GET    /runs/:runId`       — poll run status
 * - `GET    /runs/:runId/stream`— SSE token stream
 * - `DELETE /runs/:runId`       — cancel a run
 *
 * Uses native `fetch` (Node 18+). SSE streaming is implemented by reading
 * the response body as a `ReadableStream` and emitting each chunk as an
 * RxJS `Observable<MessageEvent>`.
 */
@Injectable()
export class AgentsService {
  private readonly logger: AppLogger;
  private readonly ragServiceBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.child({ context: AgentsService.name });
    this.ragServiceBaseUrl =
      this.config.get<string>('RAG_SERVICE_URL') ?? 'http://localhost:8002';
  }

  /**
   * Creates a new agent run on the rag-service.
   *
   * @param dto - Run creation payload.
   * @returns Promise resolving to the rag-service run object (includes runId).
   * @throws AppError with EXT0001 when rag-service is unreachable.
   */
  async createRun(dto: CreateRunDto): Promise<unknown> {
    const url = `${this.ragServiceBaseUrl}/runs`;
    this.logger.info('Creating agent run', { url });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      this.logger.error('rag-service unreachable', { error: (err as Error).message });
      throw new AppError({
        code: ERROR_CODES.EXT.SERVICE_UNAVAILABLE.code,
        message: 'Agent service is currently unavailable',
        cause: err instanceof Error ? err : undefined,
      });
    }

    if (!response.ok) {
      throw new AppError({
        code: ERROR_CODES.EXT.INVALID_RESPONSE.code,
        message: `Agent service returned HTTP ${response.status}`,
        statusCode: response.status >= 500 ? 502 : response.status,
      });
    }

    return response.json();
  }

  /**
   * Returns the current status and metadata for an agent run.
   *
   * @param runId - The ACP run identifier.
   * @returns Promise resolving to the run info object.
   * @throws AppError with EXT0001 when rag-service is unreachable.
   */
  async getRun(runId: string): Promise<unknown> {
    const url = `${this.ragServiceBaseUrl}/runs/${runId}`;
    this.logger.info('Fetching agent run', { runId, url });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      this.logger.error('rag-service unreachable', { error: (err as Error).message });
      throw new AppError({
        code: ERROR_CODES.EXT.SERVICE_UNAVAILABLE.code,
        message: 'Agent service is currently unavailable',
        cause: err instanceof Error ? err : undefined,
      });
    }

    if (!response.ok) {
      throw new AppError({
        code: ERROR_CODES.EXT.INVALID_RESPONSE.code,
        message: `Agent service returned HTTP ${response.status}`,
        statusCode: response.status === 404 ? 404 : 502,
      });
    }

    return response.json();
  }

  /**
   * Cancels an in-progress agent run on the rag-service.
   *
   * @param runId - The ACP run identifier to cancel.
   * @returns Promise resolving to void.
   */
  async cancelRun(runId: string): Promise<void> {
    const url = `${this.ragServiceBaseUrl}/runs/${runId}`;
    this.logger.info('Cancelling agent run', { runId, url });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'DELETE',
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      this.logger.error('rag-service unreachable during cancel', {
        runId,
        error: (err as Error).message,
      });
      throw new AppError({
        code: ERROR_CODES.EXT.SERVICE_UNAVAILABLE.code,
        message: 'Agent service is currently unavailable',
        cause: err instanceof Error ? err : undefined,
      });
    }

    if (!response.ok && response.status !== 404) {
      throw new AppError({
        code: ERROR_CODES.EXT.INVALID_RESPONSE.code,
        message: `Agent service returned HTTP ${response.status}`,
        statusCode: 502,
      });
    }
  }

  /**
   * Opens an SSE stream to the rag-service for a given run and re-emits
   * each chunk as an RxJS `Observable<MessageEvent>`.
   *
   * The Observable completes when the rag-service closes the stream.
   * Errors in the upstream stream are forwarded as Observable errors.
   *
   * @param runId - The ACP run identifier to stream.
   * @returns Observable of NestJS MessageEvent objects.
   */
  streamRun(runId: string): Observable<MessageEvent> {
    const url = `${this.ragServiceBaseUrl}/runs/${runId}/stream`;
    this.logger.info('Opening SSE stream for agent run', { runId, url });

    return new Observable<MessageEvent>((subscriber) => {
      const controller = new AbortController();

      fetch(url, {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            subscriber.error(
              new AppError({
                code: ERROR_CODES.EXT.INVALID_RESPONSE.code,
                message: `Agent stream returned HTTP ${response.status}`,
                statusCode: 502,
              }),
            );
            return;
          }

          if (!response.body) {
            subscriber.error(
              new AppError({
                code: ERROR_CODES.EXT.INVALID_RESPONSE.code,
                message: 'Agent stream response has no body',
                statusCode: 502,
              }),
            );
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              // Forward raw SSE chunk as a MessageEvent
              subscriber.next({ data: chunk } as MessageEvent);
            }
            subscriber.complete();
          } catch (err) {
            if ((err as Error).name !== 'AbortError') {
              subscriber.error(err);
            }
          } finally {
            reader.releaseLock();
          }
        })
        .catch((err: Error) => {
          if (err.name !== 'AbortError') {
            this.logger.error('SSE stream connection failed', { runId, error: err.message });
            subscriber.error(
              new AppError({
                code: ERROR_CODES.EXT.SERVICE_UNAVAILABLE.code,
                message: 'Agent service is currently unavailable',
                cause: err,
              }),
            );
          }
        });

      // Teardown: abort the fetch when the Observable is unsubscribed
      return () => {
        controller.abort();
      };
    });
  }
}
