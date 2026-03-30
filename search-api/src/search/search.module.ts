import { Module } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";
import { Bm25Service } from "./bm25.service";
import { SemanticService } from "./semantic.service";
import { RrfService } from "./rrf.service";
import { PrismaModule } from "../prisma/prisma.module";

/**
 * SearchModule bundles all search-related providers and the controller.
 *
 * Providers registered here:
 * - `SearchService`   — orchestrates the three-stage pipeline
 * - `Bm25Service`     — PostgreSQL FTS with mock fallback (requires PrismaModule)
 * - `SemanticService` — Qdrant ANN with mock fallback
 * - `RrfService`      — Reciprocal Rank Fusion
 *
 * `PrismaModule` is imported so `PrismaService` is available to `Bm25Service`
 * for real-mode PostgreSQL FTS queries.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SearchController],
  providers: [SearchService, Bm25Service, SemanticService, RrfService],
})
export class SearchModule {}
