import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { KmsSearchResponse } from './external-agent/external-agent.types';

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
];

/**
 * AcpToolRegistry provides the implementation for each registered ACP tool.
 *
 * Phase 1 exposes a single tool: kms_search.
 */
@Injectable()
export class AcpToolRegistry {
  private readonly logger: AppLogger;
  private readonly searchApiUrl: string;

  constructor(
    private readonly config: ConfigService,
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
}
