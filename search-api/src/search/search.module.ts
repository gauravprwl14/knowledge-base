import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { KeywordService } from './keyword.service';
import { SemanticService } from './semantic.service';
import { RrfService } from './rrf.service';

/**
 * SearchModule — wires together the keyword, semantic, and RRF services that
 * power the `GET /api/v1/search` endpoint.
 *
 * `ConfigModule` is imported to allow {@link SemanticService} to read
 * `QDRANT_URL` and `EMBED_WORKER_URL` from the environment.
 *
 * `PrismaModule` is global so it does not need to be imported here.
 */
@Module({
  imports: [ConfigModule],
  controllers: [SearchController],
  providers: [SearchService, KeywordService, SemanticService, RrfService],
  exports: [SearchService],
})
export class SearchModule {}
