import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { SearchResult } from './dto/search-response.dto';

/**
 * Five canonical seed documents used when MOCK_BM25=true.
 * These cover the main KMS knowledge domains so search results are realistic
 * during development and integration testing without a live database.
 */
const MOCK_DOCUMENTS: Omit<SearchResult, 'score'>[] = [
  {
    id: 'mock-chunk-001',
    fileId: 'mock-file-001',
    filename: 'rag-pipeline-architecture.md',
    content:
      'RAG Pipeline Architecture: The retrieval-augmented generation pipeline combines ' +
      'dense vector retrieval from Qdrant with BM25 keyword search. Results are fused ' +
      'using Reciprocal Rank Fusion (RRF) before being passed to the LLM generator.',
    chunkIndex: 0,
    metadata: { topic: 'rag', type: 'architecture' },
  },
  {
    id: 'mock-chunk-002',
    fileId: 'mock-file-002',
    filename: 'nestjs-fastify-performance.md',
    content:
      'NestJS Fastify Performance: Replacing Express with the Fastify adapter delivers ' +
      '2–3× higher throughput on identical hardware. The @nestjs/platform-fastify package ' +
      'wraps Fastify while preserving the full NestJS DI and decorator system.',
    chunkIndex: 0,
    metadata: { topic: 'nestjs', type: 'performance' },
  },
  {
    id: 'mock-chunk-003',
    fileId: 'mock-file-003',
    filename: 'bge-m3-embedding-model.md',
    content:
      'BGE-M3 Embedding Model: BAAI/bge-m3 generates 1024-dimensional dense embeddings ' +
      'optimised for multilingual retrieval. It supports sparse, dense, and ColBERT-style ' +
      'multi-vector representations, making it ideal for hybrid search pipelines.',
    chunkIndex: 0,
    metadata: { topic: 'embeddings', type: 'model' },
  },
  {
    id: 'mock-chunk-004',
    fileId: 'mock-file-004',
    filename: 'acp-protocol-integration.md',
    content:
      'ACP Protocol Integration: The Agent Communication Protocol (ACP) defines a ' +
      'standardised REST envelope for multi-agent message passing. The KMS gateway ' +
      'exposes an ACP-compatible endpoint that routes tasks to specialist sub-agents.',
    chunkIndex: 0,
    metadata: { topic: 'acp', type: 'protocol' },
  },
  {
    id: 'mock-chunk-005',
    fileId: 'mock-file-005',
    filename: 'neo4j-knowledge-graph.md',
    content:
      'Neo4j Knowledge Graph: The graph-worker extracts entity relationships from ' +
      'ingested documents and persists them to Neo4j. Cypher queries then augment ' +
      'RAG context with related concept nodes, improving answer coherence.',
    chunkIndex: 0,
    metadata: { topic: 'neo4j', type: 'graph' },
  },
];

/**
 * BM25Service performs PostgreSQL full-text search against the kms_chunks table.
 *
 * In mock mode (MOCK_BM25=true) it returns the five canonical seed documents
 * ranked by a simple case-insensitive term-frequency score, avoiding any DB
 * dependency during development and testing.
 *
 * In real mode it issues a `$queryRaw` Prisma call using `ts_rank` and
 * `to_tsquery` for proper BM25-style PostgreSQL FTS.
 */
@Injectable()
export class Bm25Service {
  /** Whether to skip the real database and return mock results. */
  private readonly mockMode: boolean;

  constructor(
    private readonly config: ConfigService,
    @InjectPinoLogger(Bm25Service.name)
    private readonly logger: PinoLogger,
  ) {
    // Read MOCK_BM25 from validated config; default true so the service starts without a DB
    this.mockMode = this.config.get<boolean>('MOCK_BM25') ?? true;
  }

  /**
   * Performs BM25 keyword search.
   *
   * Falls back to deterministic mock results when MOCK_BM25=true.
   *
   * @param query     - Raw search query string from the caller
   * @param userId    - Caller's user ID for result scoping (multi-tenant isolation)
   * @param limit     - Maximum number of results to return
   * @param sourceIds - Optional list of source IDs to restrict the result set
   * @returns Ranked list of SearchResult objects (no RRF applied yet)
   */
  async search(
    query: string,
    userId: string,
    limit: number,
    sourceIds?: string[],
  ): Promise<SearchResult[]> {
    // Mock mode: rank the five seed docs by simple term frequency, skip the DB entirely
    if (this.mockMode) {
      return this.mockSearch(query, limit);
    }

    // Real mode: delegate to PostgreSQL FTS
    return this.pgSearch(query, userId, limit, sourceIds);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns mock BM25 results ranked by naive term-frequency scoring.
   * Each query term is counted in the document content (case-insensitive).
   * Documents with zero matching terms still appear but score near zero.
   *
   * @param query - Search query string
   * @param limit - Maximum results to return
   */
  private mockSearch(query: string, limit: number): SearchResult[] {
    this.logger.debug({ query, limit }, 'bm25: mock mode — returning seed documents');

    // Tokenise the query into lowercase terms for term-frequency scoring
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    // Score each document by counting how many query terms appear in its content
    const scored = MOCK_DOCUMENTS.map((doc) => {
      const contentLower = doc.content.toLowerCase();
      // BM25 approximation: sum of term frequencies (no IDF weighting in mock)
      const termFreqScore = terms.reduce((acc, term) => {
        const regex = new RegExp(term, 'gi');
        const matches = contentLower.match(regex);
        return acc + (matches ? matches.length : 0);
      }, 0);

      // Normalise to (0, 1] range: use a sigmoid-like transform to avoid raw counts
      const score = termFreqScore > 0 ? Math.min(termFreqScore / (termFreqScore + 5), 0.95) : 0.05;

      return { ...doc, score };
    });

    // Sort descending by score, take up to limit
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Executes a raw PostgreSQL FTS query using ts_rank + to_tsquery.
   *
   * NOTE: PrismaService is not injected here because search-api does not carry
   * the full Prisma schema. For Sprint 2 this stub throws until the DB module
   * is wired. Set MOCK_BM25=true to bypass.
   *
   * @param query     - Search query string (sanitised before passing to ts_query)
   * @param userId    - Owner user ID
   * @param limit     - Row limit
   * @param sourceIds - Optional source filter
   */
  private async pgSearch(
    query: string,
    userId: string,
    limit: number,
    sourceIds?: string[],
  ): Promise<SearchResult[]> {
    // Convert free-text query to a ts_query-safe AND-joined expression
    const tsQuery = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(Boolean)
      .join(' & ');

    this.logger.info({ tsQuery, userId, limit, sourceIds }, 'bm25: executing PostgreSQL FTS');

    void query;
    void userId;
    void sourceIds;
    throw new Error('BM25 real-mode not yet implemented — set MOCK_BM25=true');
  }
}
