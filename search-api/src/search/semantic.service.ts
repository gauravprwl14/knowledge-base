import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { SearchResult } from './dto/search-response.dto';

/**
 * Deterministic mock scores for each of the five seed documents.
 * Using fixed values ensures tests are reproducible regardless of query.
 * Scores are intentionally different from BM25 mock scores so RRF fusion
 * produces meaningful merged rankings.
 */
const MOCK_SEMANTIC_SCORES: Record<string, number> = {
  'mock-chunk-001': 0.91, // RAG Pipeline Architecture — high semantic affinity
  'mock-chunk-002': 0.78, // NestJS Fastify Performance
  'mock-chunk-003': 0.85, // BGE-M3 Embedding Model
  'mock-chunk-004': 0.72, // ACP Protocol Integration
  'mock-chunk-005': 0.80, // Neo4j Knowledge Graph
};

/** Seed document metadata — content mirrors BM25Service mock data. */
const MOCK_SEMANTIC_DOCS: Omit<SearchResult, 'score'>[] = [
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
 * SemanticService performs approximate nearest-neighbour (ANN) vector search
 * against the Qdrant collection `kms_chunks`.
 *
 * In mock mode (MOCK_SEMANTIC=true) it returns the five seed documents with
 * deterministic fixed scores. This lets the RRF service run its full fusion
 * logic without a live Qdrant instance.
 *
 * In real mode it:
 * 1. Obtains a query embedding (1024-dim BGE-M3 vector) from the embed service.
 * 2. POSTs to Qdrant `/collections/{collection}/points/search` with a user_id filter.
 * 3. Maps Qdrant point payloads to SearchResult objects.
 */
@Injectable()
export class SemanticService {
  /** Whether to skip Qdrant and return deterministic mock results. */
  private readonly mockMode: boolean;

  /** Base URL of the Qdrant HTTP API. */
  private readonly qdrantUrl: string;

  /** Target Qdrant collection for chunk vectors. */
  private readonly collection: string;

  constructor(
    private readonly config: ConfigService,
    @InjectPinoLogger(SemanticService.name)
    private readonly logger: PinoLogger,
  ) {
    // Read Qdrant config and mock flag from validated env vars
    this.mockMode = this.config.get<boolean>('MOCK_SEMANTIC') ?? true;
    this.qdrantUrl = this.config.get<string>('QDRANT_URL') ?? 'http://localhost:6333';
    this.collection = this.config.get<string>('QDRANT_COLLECTION') ?? 'kms_chunks';
  }

  /**
   * Performs semantic ANN search against Qdrant (or returns mock results).
   *
   * @param query     - Raw search query string (will be embedded in real mode)
   * @param userId    - Caller user ID used as a Qdrant payload filter
   * @param limit     - Maximum number of results to return
   * @param sourceIds - Optional list of source IDs for additional filtering
   * @returns Ranked list of SearchResult objects
   */
  async search(
    query: string,
    userId: string,
    limit: number,
    sourceIds?: string[],
  ): Promise<SearchResult[]> {
    // Mock mode: return deterministic results sorted by pre-set semantic scores
    if (this.mockMode) {
      return this.mockSearch(limit);
    }

    // Real mode: embed the query then query Qdrant
    return this.qdrantSearch(query, userId, limit, sourceIds);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns mock semantic results with deterministic fixed scores.
   * Sorted descending so RRF sees a correctly ranked list.
   *
   * @param limit - Maximum results to return
   */
  private mockSearch(limit: number): SearchResult[] {
    this.logger.debug({ limit }, 'semantic: mock mode — returning deterministic seed results');

    // Attach the fixed mock score to each document and sort by it descending
    const results = MOCK_SEMANTIC_DOCS.map((doc) => ({
      ...doc,
      score: MOCK_SEMANTIC_SCORES[doc.id] ?? 0.5,
    }));

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Executes a real Qdrant ANN search.
   *
   * Steps:
   * 1. Generate a 1024-dim BGE-M3 embedding for the query (embed-service HTTP call).
   * 2. Build the Qdrant search payload with user_id + optional source_id filter.
   * 3. POST to Qdrant and map the response points to SearchResult objects.
   *
   * NOTE: The embed-service HTTP client is not injected in Sprint 2.
   * Set MOCK_SEMANTIC=true until Sprint 3 wires up the HTTP module.
   *
   * @param query     - Query text to embed
   * @param userId    - User ID payload filter
   * @param limit     - Top-k limit for Qdrant
   * @param sourceIds - Optional source ID filter
   */
  private async qdrantSearch(
    query: string,
    userId: string,
    limit: number,
    sourceIds?: string[],
  ): Promise<SearchResult[]> {
    this.logger.info(
      { qdrantUrl: this.qdrantUrl, collection: this.collection, userId, limit },
      'semantic: executing Qdrant ANN search',
    );

    // TODO Sprint 3: inject HttpService and embed-service URL, then:
    //
    // 1. Get embedding:
    //    const { data: { embedding } } = await this.http.post('/embed', { text: query }).toPromise();
    //
    // 2. Build Qdrant filter:
    //    const filter = { must: [{ key: 'user_id', match: { value: userId } }] };
    //    if (sourceIds?.length) filter.must.push({ key: 'source_id', match: { any: sourceIds } });
    //
    // 3. POST to Qdrant:
    //    const url = `${this.qdrantUrl}/collections/${this.collection}/points/search`;
    //    const body = { vector: embedding, limit, filter, with_payload: true };
    //    const { data: { result } } = await this.http.post(url, body).toPromise();
    //
    // 4. Map result points:
    //    return result.map(p => ({
    //      id: String(p.id), fileId: p.payload.file_id, filename: p.payload.filename,
    //      content: p.payload.content, score: p.score,
    //      chunkIndex: p.payload.chunk_index, metadata: p.payload.metadata,
    //    }));

    void query;
    void userId;
    void sourceIds;
    throw new Error('Semantic real-mode not yet implemented — set MOCK_SEMANTIC=true');
  }
}
