import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * SearchModule proxies read-only hybrid search requests to the `search-api`
 * microservice (port 8001).
 *
 * Uses native `fetch` (Node 18+) instead of `@nestjs/axios` since that
 * package is not declared as a dependency. ConfigModule is imported to allow
 * SearchService to read `SEARCH_API_URL` from the environment.
 */
@Module({
  imports: [ConfigModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
