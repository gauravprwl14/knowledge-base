import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  HttpException,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiBody,
} from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { SearchService } from "./search.service";
import { SearchRequestDto } from "./dto/search-request.dto";
import { SearchResponseDto } from "./dto/search-response.dto";

/**
 * SearchController exposes the hybrid search endpoints.
 *
 * Authentication strategy: this service is internal — it trusts the `x-user-id`
 * header that kms-api injects after verifying the JWT. No JWT validation here.
 *
 * Endpoints:
 * - `POST /search`       — main hybrid search (keyword | semantic | hybrid)
 * - `POST /search/seed`  — development-only endpoint to verify mock data is available
 */
@ApiTags("search")
@Controller("search")
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly config: ConfigService,
    @InjectPinoLogger(SearchController.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Main search endpoint — performs BM25 + semantic + RRF fusion.
   *
   * @param dto      - Validated search request body
   * @param userId   - Caller identity from x-user-id header (required)
   * @returns Ranked SearchResponseDto with results, total, searchType, and took
   *
   * @example
   * ```http
   * POST /search
   * x-user-id: user_abc123
   * Content-Type: application/json
   *
   * { "query": "RAG pipeline architecture", "limit": 5, "searchType": "hybrid" }
   * ```
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({
    summary: "Hybrid search",
    description:
      "Executes BM25 keyword search and/or Qdrant semantic search, " +
      "then fuses results with Reciprocal Rank Fusion (k=60).",
  })
  @ApiHeader({
    name: "x-user-id",
    description: "Caller user ID — injected by kms-api after JWT verification",
    required: true,
  })
  @ApiBody({ type: SearchRequestDto })
  @ApiResponse({
    status: 200,
    description: "Search results",
    type: SearchResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Missing or empty query / invalid x-user-id header",
  })
  @ApiResponse({ status: 500, description: "Search pipeline error" })
  async search(
    @Body() dto: SearchRequestDto,
    @Headers("x-user-id") userId: string,
  ): Promise<SearchResponseDto> {
    // Validate the user identity header — reject requests that arrive without it
    if (!userId || !userId.trim()) {
      throw new HttpException(
        "x-user-id header is required",
        HttpStatus.BAD_REQUEST,
      );
    }

    // Delegate to SearchService which orchestrates BM25 + semantic + RRF
    return this.searchService.search(dto, userId.trim());
  }

  /**
   * Seed endpoint — available ONLY in non-production environments.
   * Returns the five canonical mock documents to confirm mock mode is active.
   *
   * This endpoint is useful for integration tests and local UI development
   * without a running database or Qdrant instance.
   *
   * @returns 201 with the list of seed document IDs and titles
   * @throws 403 in production environments
   */
  @Post("seed")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Seed mock data (dev only)",
    description:
      "Returns the five seed documents used in MOCK_BM25/MOCK_SEMANTIC mode. " +
      "Disabled in production (returns 403).",
  })
  @ApiResponse({ status: 201, description: "Seed document list returned" })
  @ApiResponse({ status: 403, description: "Not available in production" })
  async seed(): Promise<{
    seeded: boolean;
    documents: Array<{ id: string; title: string }>;
  }> {
    // Guard: this endpoint must not be reachable in production deployments
    const env = this.config.get<string>("NODE_ENV");
    if (env === "production") {
      throw new HttpException(
        "Seed endpoint is disabled in production",
        HttpStatus.FORBIDDEN,
      );
    }

    this.logger.info({ env }, "search/seed: returning mock document list");

    // Return metadata about the five canonical seed documents
    return {
      seeded: true,
      documents: [
        { id: "mock-file-001", title: "RAG Pipeline Architecture" },
        { id: "mock-file-002", title: "NestJS Fastify Performance" },
        { id: "mock-file-003", title: "BGE-M3 Embedding Model" },
        { id: "mock-file-004", title: "ACP Protocol Integration" },
        { id: "mock-file-005", title: "Neo4j Knowledge Graph" },
      ],
    };
  }
}
