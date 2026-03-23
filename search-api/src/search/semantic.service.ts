import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { QdrantClient } from '@qdrant/js-client-rest';
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

  /** Base URL of the embed-worker HTTP service. */
  private readonly embedWorkerUrl: string;

  /** Lazy-initialised Qdrant REST client (real mode only). */
  private _qdrantClient?: QdrantClient;

  constructor(
    private readonly config: ConfigService,
    @InjectPinoLogger(SemanticService.name)
    private readonly logger: PinoLogger,
  ) {
    // Read Qdrant config and mock flag from validated env vars
    this.mockMode = this.config.get<boolean>('MOCK_SEMANTIC') ?? true;
    this.qdrantUrl = this.config.get<string>('QDRANT_URL') ?? 'http://localhost:6333';
    this.collection = this.config.get<string>('QDRANT_COLLECTION') ?? 'kms_chunks';
    this.embedWorkerUrl = this.config.get<string>('EMBED_WORKER_URL') ?? 'http://localhost:8004';
  }

  /**
   * Returns a lazily-created QdrantClient for real-mode searches.
   * The client is shared across calls to avoid repeated TCP handshakes.
   */
  private get qdrantClient(): QdrantClient {
    if (!this._qdrantClient) {
      this._qdrantClient = new QdrantClient({ url: this.qdrantUrl });
    }
    return this._qdrantClient;
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
   * 1. POST to embed-worker ``/embed`` to obtain a 1024-dim BGE-M3 vector.
   * 2. Build the Qdrant ``must`` filter on ``user_id`` (+ optional ``source_id``).
   * 3. Search the Qdrant collection and map point payloads to SearchResult objects.
   *
   * @param query     - Query text to embed
   * @param userId    - User ID payload filter (multi-tenant isolation)
   * @param limit     - Top-k limit for Qdrant
   * @param sourceIds - Optional list of source IDs for additional filtering
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

    // ── Step 1: Obtain a BGE-M3 embedding for the query ─────────────────────
    const embedResponse = await fetch(`${this.embedWorkerUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: query }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!embedResponse.ok) {
      throw new Error(
        `embed-worker returned HTTP ${embedResponse.status} for query embedding`,
      );
    }

    const embedData = (await embedResponse.json()) as { embedding: number[] };
    const vector = embedData.embedding;

    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error('embed-worker returned an empty or invalid embedding vector');
    }

    this.logger.debug({ vectorLength: vector.length }, 'semantic: query vector obtained');

    // ── Step 2: Build Qdrant payload filter ─────────────────────────────────
    // Always filter by user_id for multi-tenant isolation.
    // Optionally narrow to specific source IDs when provided.
    const mustClauses: Record<string, unknown>[] = [
      { key: 'user_id', match: { value: userId } },
    ];

    if (sourceIds && sourceIds.length > 0) {
      mustClauses.push({ key: 'source_id', match: { any: sourceIds } });
    }

    // ── Step 3: Search Qdrant ────────────────────────────────────────────────
    const searchResult = await this.qdrantClient.search(this.collection, {
      vector,
      limit,
      with_payload: true,
      filter: { must: mustClauses } as Parameters<QdrantClient['search']>[1]['filter'],
    });

    this.logger.info({ resultCount: searchResult.length, userId }, 'semantic: Qdrant search complete');

    // ── Step 4: Map Qdrant points to SearchResult objects ───────────────────
    return searchResult.map((point) => {
      const pl = (point.payload ?? {}) as Record<string, unknown>;
      return {
        id: String(point.id),
        fileId: String(pl['file_id'] ?? ''),
        filename: String(pl['filename'] ?? ''),
        content: String(pl['content'] ?? ''),
        score: point.score,
        chunkIndex: Number(pl['chunk_index'] ?? 0),
        webViewLink: pl['web_view_link'] ? String(pl['web_view_link']) : undefined,
        startSecs: pl['start_secs'] != null ? Number(pl['start_secs']) : undefined,
        sourceType: pl['source_type'] ? String(pl['source_type']) : undefined,
        metadata: typeof pl['metadata'] === 'object' && pl['metadata'] !== null
          ? (pl['metadata'] as Record<string, unknown>)
          : undefined,
      };
    });
  }
}
