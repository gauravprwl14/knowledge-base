import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';

/** Supported search modes forwarded to the search-api service. */
export type SearchType = 'keyword' | 'semantic' | 'hybrid';

/** Parameters forwarded to the search-api POST /search endpoint. */
export interface SearchQuery {
  /** Full-text search string */
  q: string;
  /** Search strategy — defaults to `hybrid` */
  type?: SearchType;
  /** Maximum number of results — defaults to 10 */
  limit?: number;
  /** Number of results to skip for pagination — defaults to 0 (not forwarded; search-api uses cursor) */
  offset?: number;
}

/**
 * SearchService proxies search requests to the read-only `search-api`
 * microservice running on port 8001.
 *
 * The service uses the native `fetch` API (Node 18+) because
 * `@nestjs/axios` is not a declared dependency in this project.
 * If the search-api is unavailable an `EXT.SERVICE_UNAVAILABLE` AppError
 * is thrown so the global exception filter returns a structured response.
 */
@Injectable()
export class SearchService {
  private readonly logger: AppLogger;
  private readonly searchApiBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.child({ context: SearchService.name });
    this.searchApiBaseUrl =
      this.config.get<string>('SEARCH_API_URL') ?? 'http://localhost:8001';
  }

  /**
   * Executes a search query against the search-api service.
   *
   * @param query - Search parameters (q, type, limit, offset).
   * @returns Promise resolving to the raw search-api JSON response.
   * @throws AppError with code EXT0001 when search-api is unreachable.
   * @throws AppError with code EXT0004 when the search-api returns an error status.
   */
  async search(query: SearchQuery): Promise<unknown> {
    const { q, type = 'hybrid', limit = 10 } = query;

    // search-api exposes POST /search with a JSON body ({ query, searchType, limit }).
    // Field mapping:
    //   kms-api `q`    → search-api `query`
    //   kms-api `type` → search-api `searchType`
    //   kms-api `limit` → search-api `limit`
    const body = JSON.stringify({ query: q, searchType: type, limit });

    const url = `${this.searchApiBaseUrl}/search`;

    this.logger.info('Proxying search request to search-api', { url, type, limit });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(10_000), // 10-second timeout
      });
    } catch (err) {
      this.logger.error('search-api unreachable', { url, error: (err as Error).message });
      throw new AppError({
        code: ERROR_CODES.EXT.SERVICE_UNAVAILABLE.code,
        message: 'Search service is currently unavailable',
        cause: err instanceof Error ? err : undefined,
      });
    }

    if (!response.ok) {
      this.logger.warn('search-api returned non-2xx response', {
        url,
        status: response.status,
      });
      throw new AppError({
        code: ERROR_CODES.EXT.INVALID_RESPONSE.code,
        message: `Search service returned an error: HTTP ${response.status}`,
        statusCode: response.status >= 500 ? 502 : response.status,
      });
    }

    return response.json();
  }
}
