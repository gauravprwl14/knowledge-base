import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { KeywordSearchService } from './services/keyword-search.service';
import { SemanticSearchService } from './services/semantic-search.service';
import { HybridSearchService } from './services/hybrid-search.service';
import { CacheModule } from '@nestjs/cache-manager';

/**
 * SearchModule wires together all three search strategy services and exposes
 * the unified SearchService + SearchController.
 *
 * Providers:
 * - KeywordSearchService — PostgreSQL FTS
 * - SemanticSearchService — Qdrant ANN via BGE-M3 embeddings
 * - HybridSearchService — RRF merge of keyword + semantic
 * - SearchService — strategy router
 */
@Module({
  imports: [
    CacheModule.register({ ttl: 30_000, max: 500 }),
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    KeywordSearchService,
    SemanticSearchService,
    HybridSearchService,
  ],
  exports: [SearchService],
})
export class SearchModule {}
