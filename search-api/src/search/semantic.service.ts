import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { SearchResultItemDto } from './dto/search-result.dto';

/**
 * SemanticService — ANN vector search over the `kms_chunks` Qdrant collection
 * using BGE-M3 1024-dimensional embeddings.
 *
 * ### Mock mode
 * Set `MOCK_SEMANTIC=true` (env) to bypass Qdrant entirely and return
 * deterministic seed results. Useful for local development and CI where
 * no Qdrant instance is running.
 *
 * ### Graceful degradation
 * When Qdrant is unavailable (unreachable or returns a non-2xx response),
 * an empty result set is returned so the hybrid pipeline can still surface
 * keyword results.
 *
 * @example
 * ```typescript
 * const results = await semanticService.search('machine learning', userId, 20, ['src-uuid']);
 * ```
 */
@Injectable()
export class SemanticService {
  private readonly qdrant: QdrantClient;
  private readonly embedWorkerUrl: string;
  private readonly collectionName = 'kms_chunks';
  private readonly vectorDimension = 1024;

  /**
   * Whether to use deterministic mock results instead of real Qdrant queries.
   * Controlled by the MOCK_SEMANTIC env var; defaults to false.
   */
  private readonly mockMode: boolean;

  constructor(
    @InjectPinoLogger(SemanticService.name)
    private readonly logger: PinoLogger,
    private readonly config: ConfigService,
  ) {
    const qdrantUrl = this.config.get<string>('QDRANT_URL', 'http://localhost:6333');
    this.qdrant = new QdrantClient({ url: qdrantUrl });
    this.embedWorkerUrl = this.config.get<string>(
      'EMBED_WORKER_URL',
      'http://embed-worker:8010',
    );
    // MOCK_SEMANTIC=true disables real Qdrant calls — useful in dev/CI
    this.mockMode = this.config.get<string>('MOCK_SEMANTIC') === 'true';

    if (this.mockMode) {
      this.logger.warn(
        { mockMode: true },
        'SemanticService running in mock mode — MOCK_SEMANTIC=true; Qdrant will not be queried',
      );
    }
  }

  /**
   * Encodes `text` to a 1024-dim embedding vector via the embed-worker.
   *
   * Returns a zero vector and logs a warning if the endpoint is unavailable —
   * the zero vector will produce near-zero cosine similarity scores, giving
   * keyword-only results in hybrid mode rather than crashing.
   *
   * @param text - The raw query string to embed.
   * @returns A 1024-element float array.
   */
  private async embed(text: string): Promise<number[]> {
    try {
      const url = `${this.embedWorkerUrl}/embed?text=${encodeURIComponent(text)}`;
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) {
        throw new Error(`embed-worker returned HTTP ${res.status}`);
      }

      const data = (await res.json()) as { vector?: number[] };
      if (!Array.isArray(data.vector) || data.vector.length !== this.vectorDimension) {
        throw new Error(
          `embed-worker returned unexpected vector shape: ${JSON.stringify(data).slice(0, 100)}`,
        );
      }

      return data.vector;
    } catch (error) {
      this.logger.warn(
        { error: (error as Error).message, text: text.slice(0, 80) },
        'Semantic search not yet connected — embed-worker unreachable; returning zero vector',
      );
      // Zero vector: Qdrant will return low-scoring results rather than throwing
      return new Array(this.vectorDimension).fill(0) as number[];
    }
  }

  /**
   * Returns deterministic mock results for development/testing without Qdrant.
   *
   * Documents are pre-scored; a small score boost is applied when query terms
   * appear verbatim in the snippet, so different queries produce slightly
   * different orderings without needing a real model.
   *
   * @param query - Raw user query (used for keyword-based score boosting).
   * @param limit - Maximum number of results.
   * @returns Up to `limit` mock {@link SearchResultItemDto} items.
   */
  private mockResults(query: string, limit: number): SearchResultItemDto[] {
    // Seed documents that mirror real KMS knowledge base content
    const MOCK_DOCS: SearchResultItemDto[] = [
      {
        fileId: 'mock-file-001',
        filename: 'ENGINEERING_STANDARDS.md',
        mimeType: 'text/markdown',
        sourceId: 'mock-source-001',
        snippet:
          'KMS uses BAAI/bge-m3 as the embedding model at 1024 dimensions. ' +
          'Chosen per ADR-0009 for superior multilingual performance and dense+sparse hybrid capability.',
        score: 0.92,
        chunkIndex: 0,
      },
      {
        fileId: 'mock-file-002',
        filename: 'decisions/0009-bge-m3-embedding-model.md',
        mimeType: 'text/markdown',
        sourceId: 'mock-source-001',
        snippet:
          'ADR-0009: BGE-M3 embedding model selected. Provides 1024-dim dense vectors and optional sparse ' +
          'vectors (SPLADE). Supports 100+ languages. Runs on CPU acceptably for dev.',
        score: 0.89,
        chunkIndex: 0,
      },
      {
        fileId: 'mock-file-003',
        filename: 'decisions/0010-qdrant-vector-db.md',
        mimeType: 'text/markdown',
        sourceId: 'mock-source-001',
        snippet:
          'ADR-0010: Qdrant chosen as vector database. Supports payload filtering, ' +
          'hybrid dense+sparse search, and HNSW indexing. Self-hosted via Docker.',
        score: 0.85,
        chunkIndex: 0,
      },
      {
        fileId: 'mock-file-004',
        filename: 'KMS-AGENTIC-PLATFORM.md',
        mimeType: 'text/markdown',
        sourceId: 'mock-source-001',
        snippet:
          'KMS acts as both ACP Server (exposes tools to external agents) and ACP Client ' +
          '(delegates to Claude Code, Codex, Gemini). The ACP gateway is the entry point for all agent interactions.',
        score: 0.81,
        chunkIndex: 2,
      },
      {
        fileId: 'mock-file-005',
        filename: 'decisions/0018-acp-http-transport.md',
        mimeType: 'text/markdown',
        sourceId: 'mock-source-001',
        snippet:
          'ADR-0018: HTTP transport chosen for ACP over stdio. Docker-friendly — no subprocess management. ' +
          'JSON-RPC 2.0 over NDJSON. Session-based with Redis TTL.',
        score: 0.78,
        chunkIndex: 0,
      },
    ];

    // Apply a small score boost when query terms match snippet content, so
    // different queries produce different ranked orderings even in mock mode.
    const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = MOCK_DOCS.map((doc) => ({
      ...doc,
      score: queryTerms.some((term) => doc.snippet.toLowerCase().includes(term))
        ? doc.score + 0.05
        : doc.score,
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Performs ANN search in Qdrant and maps results to {@link SearchResultItemDto}.
   *
   * Falls back to empty results (not an error) when Qdrant is unreachable so
   * hybrid search can still return keyword results.
   *
   * @param query - Raw user query string.
   * @param userId - User UUID used as a Qdrant payload filter.
   * @param limit - Maximum number of points to retrieve.
   * @param sourceIds - Optional source UUID filter.
   * @returns Scored list of search results ordered by vector similarity descending.
   */
  async search(
    query: string,
    userId: string,
    limit: number,
    sourceIds?: string[],
  ): Promise<SearchResultItemDto[]> {
    this.logger.info({ query, userId, limit, sourceIds, mockMode: this.mockMode }, 'Executing semantic search');

    // Short-circuit to mock data when mock mode is enabled
    if (this.mockMode) {
      return this.mockResults(query, limit);
    }

    const vector = await this.embed(query);

    try {
      const filter: Record<string, unknown> = {
        must: [
          {
            key: 'user_id',
            match: { value: userId },
          },
        ],
      };

      if (sourceIds && sourceIds.length > 0) {
        (filter.must as unknown[]).push({
          key: 'source_id',
          match: { any: sourceIds },
        });
      }

      const results = await this.qdrant.search(this.collectionName, {
        vector,
        limit,
        filter,
        with_payload: true,
        score_threshold: 0.0,
      });

      return results.map((point, idx) => {
        const payload = (point.payload ?? {}) as Record<string, unknown>;
        return {
          fileId: (payload['file_id'] as string) ?? '',
          filename: (payload['filename'] as string) ?? '',
          mimeType: (payload['mime_type'] as string) ?? 'application/octet-stream',
          sourceId: (payload['source_id'] as string) ?? '',
          score: point.score,
          snippet: ((payload['text'] as string) ?? '').slice(0, 160),
          chunkIndex: (payload['chunk_index'] as number) ?? idx,
        };
      });
    } catch (error) {
      // Graceful degradation: Qdrant unreachable → empty semantic results.
      // Hybrid pipeline will still return keyword results from PostgreSQL.
      this.logger.warn(
        { error: (error as Error).message, query, userId },
        'Qdrant semantic search failed — returning empty results for graceful degradation',
      );
      return [];
    }
  }
}
