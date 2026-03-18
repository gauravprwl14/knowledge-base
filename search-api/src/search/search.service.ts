import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { KeywordService } from './keyword.service';
import { SemanticService } from './semantic.service';
import { RrfService } from './rrf.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchResponseDto, SearchResultItemDto } from './dto/search-result.dto';
import { AppError, ERROR_CODES } from '../errors/app-error';
import { PrismaService } from '../prisma/prisma.service';

/**
 * SearchService — orchestrates keyword, semantic, and hybrid search queries.
 *
 * ### Modes
 * - **keyword**: delegates to {@link KeywordService} (PostgreSQL FTS).
 * - **semantic**: delegates to {@link SemanticService} (Qdrant ANN).
 * - **hybrid**: runs both in parallel, then merges results with
 *   {@link RrfService} (Reciprocal Rank Fusion).
 *
 * All errors from downstream services are caught and surfaced as
 * {@link AppError} instances so the global exception filter can return a
 * consistent error envelope.
 *
 * @example
 * ```typescript
 * const response = await searchService.search(dto, userId);
 * ```
 */
@Injectable()
export class SearchService {
  constructor(
    @InjectPinoLogger(SearchService.name)
    private readonly logger: PinoLogger,
    private readonly keywordService: KeywordService,
    private readonly semanticService: SemanticService,
    private readonly rrfService: RrfService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Executes a search query and returns a ranked result set.
   *
   * @param dto - Validated query parameters from the controller.
   * @returns A {@link SearchResponseDto} containing results, total, timing, and mode.
   * @throws {@link AppError} with code `KBSCH0002` if all backends fail.
   */
  async search(dto: SearchQueryDto): Promise<SearchResponseDto> {
    const {
      q,
      userId,
      limit = 20,
      offset = 0,
      mode = 'hybrid',
      sourceIds,
    } = dto;

    if (!q || q.trim().length === 0) {
      throw new AppError({
        code: ERROR_CODES.SCH.QUERY_REQUIRED.code,
        message: 'Search query (q) is required and must not be blank',
      });
    }

    const start = Date.now();
    let results: SearchResultItemDto[];

    try {
      switch (mode) {
        case 'keyword':
          results = await this.keywordService.search(q, userId, limit, offset, sourceIds);
          break;

        case 'semantic':
          results = await this.semanticService.search(q, userId, limit, sourceIds);
          break;

        case 'hybrid':
        default: {
          const [keywordResults, semanticResults] = await Promise.all([
            this.keywordService.search(q, userId, limit, offset, sourceIds),
            this.semanticService.search(q, userId, limit, sourceIds),
          ]);
          results = this.rrfService.merge(keywordResults, semanticResults);
          // Apply limit/offset after merge
          results = results.slice(offset, offset + limit);
          break;
        }
      }
    } catch (error) {
      if (AppError.isAppError(error)) throw error;
      this.logger.error({ error, q, userId, mode }, 'Search operation failed');
      throw new AppError({
        code: ERROR_CODES.SCH.SEARCH_FAILED.code,
        cause: error instanceof Error ? error : undefined,
      });
    }

    const took_ms = Date.now() - start;

    this.logger.info(
      { q, userId, mode, resultCount: results.length, took_ms },
      'Search completed',
    );

    return {
      results,
      total: results.length,
      took_ms,
      mode,
    };
  }

  /**
   * Inserts mock KMS documents into `kms_files` for development/testing.
   *
   * This method is intentionally idempotent: it ensures the `extracted_text`
   * column exists (adding it when missing), then upserts 10 mock rows keyed on
   * `(source_id, external_id)` so repeated calls do not create duplicates.
   *
   * The inserted rows include real content excerpts from KMS documentation so
   * that PostgreSQL FTS queries return meaningful results during local testing.
   *
   * ### Why raw SQL?
   * The Prisma schema does not include `extracted_text` because it is managed
   * separately from the main kms-api schema.  Using `$executeRaw` lets us add
   * the column and seed data without modifying the shared Prisma schema.
   *
   * @returns The number of rows upserted.
   */
  async seedMockData(): Promise<{ seeded: number }> {
    // Ensure the extracted_text column exists — safe to run multiple times
    await this.prisma.$executeRaw`
      ALTER TABLE kms_files
        ADD COLUMN IF NOT EXISTS extracted_text TEXT
    `;

    // Ensure a seed source row exists so we satisfy the FK constraint on kms_files.source_id
    await this.prisma.$executeRaw`
      INSERT INTO kms_sources (id, user_id, type, name, status, created_at, updated_at)
      VALUES (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000099',
        'LOCAL',
        'KMS Docs (seed)',
        'IDLE',
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;

    // Seed document rows — use upsert on (source_id, external_id) for idempotency
    const mockRows = [
      {
        id: '00000000-0000-0000-0001-000000000001',
        externalId: 'seed-eng-standards',
        name: 'ENGINEERING_STANDARDS.md',
        path: '/docs/architecture/ENGINEERING_STANDARDS.md',
        mimeType: 'text/markdown',
        extractedText:
          'KMS uses BAAI/bge-m3 as the embedding model at 1024 dimensions. ' +
          'Error codes follow the pattern KB + domain + 4-digit. ' +
          'NestJS services use AppException from @kb/errors — never raw HttpException. ' +
          'Python workers use typed subclasses of KMSWorkerError with .code and .retryable. ' +
          'Logging in NestJS uses @InjectPinoLogger with nestjs-pino. ' +
          'Logging in Python uses structlog.get_logger. ' +
          'DB access in NestJS is via PrismaService injection. ' +
          'AMQP consumers use aio-pika connect_robust with nack(requeue=True) for retryable errors.',
      },
      {
        id: '00000000-0000-0000-0001-000000000002',
        externalId: 'seed-adr-bge-m3',
        name: '0009-bge-m3-embedding-model.md',
        path: '/docs/architecture/decisions/0009-bge-m3-embedding-model.md',
        mimeType: 'text/markdown',
        extractedText:
          'ADR-0009: BGE-M3 embedding model selected for KMS. ' +
          'Provides 1024-dimensional dense vectors and optional sparse SPLADE vectors. ' +
          'Supports 100+ languages with strong multilingual performance. ' +
          'Runs on CPU acceptably for development and CI environments. ' +
          'Embedding dimension of 1024 is stored in Qdrant kms_chunks collection.',
      },
      {
        id: '00000000-0000-0000-0001-000000000003',
        externalId: 'seed-adr-qdrant',
        name: '0010-qdrant-vector-db.md',
        path: '/docs/architecture/decisions/0010-qdrant-vector-db.md',
        mimeType: 'text/markdown',
        extractedText:
          'ADR-0010: Qdrant chosen as the vector database for KMS. ' +
          'Supports payload filtering for multi-tenant isolation. ' +
          'Provides hybrid dense+sparse search with HNSW indexing. ' +
          'Self-hosted via Docker with persistent volume storage. ' +
          'Collection name is kms_chunks. Each point stores file_id, user_id, source_id, content.',
      },
      {
        id: '00000000-0000-0000-0001-000000000004',
        externalId: 'seed-acp-platform',
        name: 'KMS-AGENTIC-PLATFORM.md',
        path: '/docs/prd/KMS-AGENTIC-PLATFORM.md',
        mimeType: 'text/markdown',
        extractedText:
          'KMS acts as both ACP Server and ACP Client in the agentic platform. ' +
          'As ACP Server it exposes tools to external agents via the ACP gateway. ' +
          'As ACP Client it delegates tasks to Claude Code, Codex, and Gemini. ' +
          'The ACP gateway is the single entry point for all agent interactions. ' +
          'Sessions are tracked in Redis with configurable TTL expiry.',
      },
      {
        id: '00000000-0000-0000-0001-000000000005',
        externalId: 'seed-adr-acp-transport',
        name: '0018-acp-http-transport.md',
        path: '/docs/architecture/decisions/0018-acp-http-transport.md',
        mimeType: 'text/markdown',
        extractedText:
          'ADR-0018: HTTP transport chosen for ACP over stdio. ' +
          'Docker-friendly — no subprocess management required. ' +
          'JSON-RPC 2.0 over NDJSON for streaming responses. ' +
          'Session-based with Redis TTL for state management. ' +
          'Supports multi-turn conversations with context preservation.',
      },
      {
        id: '00000000-0000-0000-0001-000000000006',
        externalId: 'seed-rrf-algorithm',
        name: 'hybrid-search-rrf.md',
        path: '/docs/architecture/hybrid-search-rrf.md',
        mimeType: 'text/markdown',
        extractedText:
          'Reciprocal Rank Fusion (RRF) merges keyword and semantic search result lists. ' +
          'Formula: RRF_score(d) = sum of 1 / (k + rank(d, list)) where k=60. ' +
          'Documents appearing in both keyword and semantic lists receive higher scores. ' +
          'Deduplication is performed by fileId before final ranking. ' +
          'RRF constant k=60 is the standard value from Cormack et al. 2009.',
      },
      {
        id: '00000000-0000-0000-0001-000000000007',
        externalId: 'seed-nestjs-patterns',
        name: 'FOR-nestjs-patterns.md',
        path: '/docs/development/FOR-nestjs-patterns.md',
        mimeType: 'text/markdown',
        extractedText:
          'NestJS services in KMS use Fastify as the HTTP adapter for better performance. ' +
          'All controllers use @ApiOperation and @ApiResponse decorators for Swagger. ' +
          'Global exception filter converts AppException to structured JSON responses. ' +
          'Rate limiting is applied globally via ThrottlerModule with 100 req/min default. ' +
          'Health endpoints are excluded from throttling via @SkipThrottle decorator.',
      },
      {
        id: '00000000-0000-0000-0001-000000000008',
        externalId: 'seed-search-api-overview',
        name: 'search-api-overview.md',
        path: '/docs/prd/search-api-overview.md',
        mimeType: 'text/markdown',
        extractedText:
          'The search-api is a read-only NestJS 11 service running on port 8001. ' +
          'It provides hybrid keyword and semantic search over the knowledge base. ' +
          'Authentication is handled upstream by kms-api which forwards x-user-id header. ' +
          'Search modes: keyword (PostgreSQL FTS), semantic (Qdrant ANN), hybrid (RRF fusion). ' +
          'Results are scored and ranked with the highest relevance returned first.',
      },
      {
        id: '00000000-0000-0000-0001-000000000009',
        externalId: 'seed-embed-worker',
        name: 'embed-worker-overview.md',
        path: '/docs/prd/embed-worker-overview.md',
        mimeType: 'text/markdown',
        extractedText:
          'The embed-worker is a Python AMQP consumer that generates BGE-M3 embeddings. ' +
          'It listens on the kms.embed RabbitMQ queue for embedding jobs. ' +
          'Each job contains a file_id and chunk text to embed. ' +
          'Embeddings are stored in Qdrant kms_chunks collection with metadata payload. ' +
          'The worker supports batch processing for improved GPU/CPU utilisation.',
      },
      {
        id: '00000000-0000-0000-0001-000000000010',
        externalId: 'seed-scan-worker',
        name: 'scan-worker-overview.md',
        path: '/docs/prd/scan-worker-overview.md',
        mimeType: 'text/markdown',
        extractedText:
          'The scan-worker discovers files from connected sources and queues them for processing. ' +
          'Supported source types: LOCAL (filesystem), GOOGLE_DRIVE (OAuth2), OBSIDIAN (vault). ' +
          'File discovery results are published to the kms.embed queue for indexing. ' +
          'Scan progress is tracked in the kms_scan_jobs table in PostgreSQL. ' +
          'Incremental scans use file modification timestamps to detect changes.',
      },
    ];

    const SEED_USER_ID = '00000000-0000-0000-0000-000000000099';
    const SEED_SOURCE_ID = '00000000-0000-0000-0000-000000000001';

    let seeded = 0;
    for (const row of mockRows) {
      await this.prisma.$executeRaw`
        INSERT INTO kms_files (
          id, user_id, source_id, name, path, mime_type, size_bytes,
          status, external_id, extracted_text, created_at, updated_at
        )
        VALUES (
          ${row.id}::uuid,
          ${SEED_USER_ID}::uuid,
          ${SEED_SOURCE_ID}::uuid,
          ${row.name},
          ${row.path},
          ${row.mimeType},
          0,
          'INDEXED',
          ${row.externalId},
          ${row.extractedText},
          NOW(),
          NOW()
        )
        ON CONFLICT (source_id, external_id) DO UPDATE
          SET extracted_text = EXCLUDED.extracted_text,
              updated_at = NOW()
      `;
      seeded++;
    }

    this.logger.info({ seeded, seedUserId: SEED_USER_ID }, 'Mock seed data inserted successfully');
    return { seeded };
  }
}
