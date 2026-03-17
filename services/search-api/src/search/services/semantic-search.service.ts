import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SearchQuery, SearchResultDto } from '../dto/search-query.dto';

/**
 * SemanticSearchService queries Qdrant for ANN (approximate nearest neighbour)
 * vector search after obtaining a dense embedding of the query string via the
 * BGE-M3 embedding endpoint.
 *
 * Embedding call is stubbed and must be wired to the embed-worker REST endpoint
 * in the embed-worker integration sprint.
 */
@Injectable()
export class SemanticSearchService {
  private readonly logger = new Logger(SemanticSearchService.name);
  private readonly qdrantUrl: string;
  private readonly embedServiceUrl: string;
  private readonly collectionName = 'kms_chunks';

  constructor(private readonly configService: ConfigService) {
    this.qdrantUrl = this.configService.get<string>('QDRANT_URL', 'http://qdrant:6333');
    // TODO: Add EMBED_SERVICE_URL to config.schema.ts when embed-worker HTTP
    // endpoint is available. Stub returns empty vector until then.
    this.embedServiceUrl = this.configService.get<string>(
      'EMBED_SERVICE_URL',
      'http://embed-worker:8004',
    );
  }

  /**
   * Embeds the query string using BGE-M3 via embed-worker REST endpoint.
   *
   * @param text - The query string to embed.
   * @returns Dense vector of 1024 dimensions, or empty array when service is unavailable.
   * @todo Wire to real embed-worker /embed endpoint once it exposes HTTP.
   */
  private async embedQuery(text: string): Promise<number[]> {
    // TODO: Replace stub with real HTTP call to embed-worker:
    //   POST ${this.embedServiceUrl}/embed { text }
    //   Response: { dense: number[], sparse: { indices: number[], values: number[] } }
    this.logger.warn({
      msg: 'embed_query_stub',
      note: 'Returning empty vector — wire to embed-worker /embed endpoint',
      text,
    });
    return [];
  }

  /**
   * Searches Qdrant collection `kms_chunks` for the top-N chunks most similar
   * to the embedded query, filtered by the caller's user_id.
   *
   * @param query - Validated search query containing q, user_id, limit, offset.
   * @returns Array of SearchResultDto sorted by Qdrant cosine score descending.
   */
  async search(query: SearchQuery): Promise<SearchResultDto[]> {
    const vector = await this.embedQuery(query.q);

    if (vector.length === 0) {
      this.logger.warn({
        msg: 'semantic_search_skipped',
        reason: 'empty_embedding_vector',
        query: query.q,
      });
      return [];
    }

    const payload: Record<string, unknown> = {
      vector,
      filter: {
        must: [{ key: 'user_id', match: { value: query.user_id } }],
      },
      limit: query.limit,
      offset: query.offset,
      with_payload: true,
      with_vector: false,
    };

    if (query.collection_ids && query.collection_ids.length > 0) {
      (payload.filter as any).must.push({
        key: 'collection_id',
        match: { any: query.collection_ids },
      });
    }

    try {
      const response = await fetch(
        `${this.qdrantUrl}/collections/${this.collectionName}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        this.logger.error({
          msg: 'qdrant_search_failed',
          status: response.status,
          body,
          query: query.q,
        });
        return [];
      }

      const data = (await response.json()) as {
        result: Array<{
          id: string;
          score: number;
          payload: {
            file_id?: string;
            file_name?: string;
            content?: string;
            chunk_index?: number;
          };
        }>;
      };

      return data.result.map((point) => ({
        chunk_id: point.id,
        file_id: point.payload.file_id ?? '',
        file_name: point.payload.file_name ?? '',
        content: point.payload.content ?? '',
        score: point.score,
        chunk_index: point.payload.chunk_index ?? 0,
      }));
    } catch (err) {
      this.logger.error({
        msg: 'qdrant_request_error',
        error: err,
        query: query.q,
      });
      return [];
    }
  }
}
