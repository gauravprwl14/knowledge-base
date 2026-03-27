import { Injectable, Logger } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { SearchResultItemDto } from './dto/search-result.dto';

/** Raw row returned by the PostgreSQL FTS query. */
interface KeywordRow {
  file_id: string;
  filename: string;
  mime_type: string;
  source_id: string;
  rank: number | string;
  snippet: string;
}

/**
 * KeywordService — full-text search over `kms_files.extracted_text` using
 * PostgreSQL `tsvector` / `plainto_tsquery`.
 *
 * Uses `PrismaService.$queryRaw` to execute the FTS query directly, since
 * Prisma does not natively support `ts_rank` or `ts_headline`.
 *
 * @example
 * ```typescript
 * const results = await keywordService.search('machine learning', userId, 20, 0, ['src-uuid']);
 * ```
 */
@Injectable()
export class KeywordService {
  constructor(
    @InjectPinoLogger(KeywordService.name)
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Executes a PostgreSQL full-text search query.
   *
   * @param query - Raw search string, passed to `plainto_tsquery`.
   * @param userId - UUID of the authenticated user; limits results to their files.
   * @param limit - Maximum number of results to return.
   * @param offset - Number of results to skip for pagination.
   * @param sourceIds - Optional list of source UUIDs to filter by.
   * @returns Ranked list of {@link SearchResultItemDto} ordered by FTS rank descending.
   */
  async search(
    query: string,
    userId: string,
    limit: number,
    offset: number,
    sourceIds?: string[],
  ): Promise<SearchResultItemDto[]> {
    this.logger.info(
      { query, userId, limit, offset, sourceIds },
      'Executing keyword search',
    );

    try {
      /*
       * The FTS query uses:
       *   - `to_tsvector('english', ...)` — builds the tsvector from extracted_text
       *   - `plainto_tsquery('english', $1)` — converts free-form user input to a tsquery
       *   - `ts_rank` — relevance ranking
       *   - `ts_headline` — 160-char snippet with matched terms wrapped in <mark>
       *
       * The `$3::uuid[]` cast allows NULL (no source filter) or a UUID array.
       */
      const rows = await this.prisma.$queryRaw<KeywordRow[]>`
        SELECT
          f.id        AS file_id,
          f.name      AS filename,
          f.mime_type,
          f.source_id,
          ts_rank(
            to_tsvector('english', COALESCE(f.extracted_text, '')),
            plainto_tsquery('english', ${query})
          ) AS rank,
          LEFT(
            ts_headline(
              'english',
              COALESCE(f.extracted_text, ''),
              plainto_tsquery('english', ${query}),
              'MaxWords=30, MinWords=15, StartSel=<mark>, StopSel=</mark>, MaxFragments=1'
            ),
            160
          ) AS snippet
        FROM kms_files f
        WHERE
          f.user_id = ${userId}::uuid
          AND to_tsvector('english', COALESCE(f.extracted_text, ''))
              @@ plainto_tsquery('english', ${query})
          AND (
            ${sourceIds && sourceIds.length > 0 ? sourceIds : null}::uuid[] IS NULL
            OR f.source_id = ANY(${sourceIds && sourceIds.length > 0 ? sourceIds : null}::uuid[])
          )
        ORDER BY rank DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      return rows.map((row) => ({
        fileId: row.file_id,
        filename: row.filename,
        mimeType: row.mime_type,
        sourceId: row.source_id,
        score: typeof row.rank === 'string' ? parseFloat(row.rank) : row.rank,
        snippet: row.snippet ?? '',
        chunkIndex: 0,
      }));
    } catch (error) {
      this.logger.error({ error, query, userId }, 'Keyword search query failed');
      return [];
    }
  }
}
