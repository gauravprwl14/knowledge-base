import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { Bm25Service } from './bm25.service';
import { SemanticService } from './semantic.service';
import { RrfService } from './rrf.service';

/**
 * SearchModule bundles all search-related providers and the controller.
 *
 * Providers registered here:
 * - `SearchService`   — orchestrates the three-stage pipeline
 * - `Bm25Service`     — PostgreSQL FTS with mock fallback
 * - `SemanticService` — Qdrant ANN with mock fallback
 * - `RrfService`      — Reciprocal Rank Fusion
 */
@Module({
  controllers: [SearchController],
  providers: [SearchService, Bm25Service, SemanticService, RrfService],
})
export class SearchModule {}
