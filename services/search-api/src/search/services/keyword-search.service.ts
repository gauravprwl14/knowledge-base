import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { SearchQuery, SearchResultDto } from '../dto/search-query.dto';

/**
 * PostgreSQL full-text search using tsvector and GIN indexes.
 * Uses the kms_fts text search configuration defined in init.sql.
 */
@Injectable()
export class KeywordSearchService {
  private readonly logger = new Logger(KeywordSearchService.name);
  private pool: Pool;

  constructor(private readonly configService: ConfigService) {
    this.pool = new Pool({
      connectionString: this.configService.get<string>('DATABASE_URL'),
      max: 10,
    });
  }

  async search(query: SearchQuery): Promise<SearchResultDto[]> {
    // Sanitize and build tsquery — use plainto_tsquery for simple phrase matching
    const sql = `
      SELECT
        f.id AS "fileId",
        f.original_filename AS "filename",
        f.source_type AS "sourceType",
        f.mime_type AS "mimeType",
        f.updated_at AS "lastModified",
        ts_rank_cd(f.fts_vector, query) AS score,
        ts_headline(
          'kms_fts',
          COALESCE(f.extracted_text, ''),
          query,
          'MaxWords=50, MinWords=20, MaxFragments=3, StartSel=<mark>, StopSel=</mark>'
        ) AS snippet,
        ARRAY[]::text[] AS highlights
      FROM kms.files f,
           plainto_tsquery('kms_fts', $1) query
      WHERE
        f.deleted_at IS NULL
        AND f.fts_vector @@ query
        ${query.sourceType ? 'AND f.source_type = $4' : ''}
      ORDER BY score DESC
      LIMIT $2 OFFSET $3
    `;

    const params: (string | number)[] = [query.q, query.limit, query.offset];
    if (query.sourceType) params.push(query.sourceType);

    try {
      const { rows } = await this.pool.query(sql, params);
      return rows as SearchResultDto[];
    } catch (err) {
      this.logger.error({ msg: 'keyword_search_failed', error: err, query: query.q });
      throw err;
    }
  }
}
