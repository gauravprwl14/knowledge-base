# search-api Service

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The `search-api` is a high-performance search service built with NestJS. It handles all search operations including full-text keyword search, semantic vector search, and hybrid search with result ranking.

---

## Service Identity

| Property | Value |
|----------|-------|
| **Name** | search-api |
| **Language** | TypeScript |
| **Framework** | NestJS 10.x |
| **Port** | 8001 |
| **Type** | API Service (Synchronous) |
| **Repository** | /search-api |

---

## Responsibilities

### Primary Responsibilities

1. **Keyword Search**
   - Full-text search using PostgreSQL
   - GIN index queries with ts_vector
   - Result ranking with ts_rank

2. **Semantic Search**
   - Vector similarity search using Qdrant
   - Query embedding generation
   - Nearest neighbor retrieval

3. **Hybrid Search**
   - Combine keyword and semantic results
   - Weighted score merging (40% keyword, 60% semantic)
   - Result deduplication

4. **Filter Processing**
   - File type filtering
   - Date range filtering
   - Source filtering
   - Size filtering
   - Tag filtering

5. **Result Caching**
   - Cache popular queries in Redis
   - TTL-based invalidation (5 minutes)
   - Cache key based on query hash

6. **Faceted Search**
   - Aggregate counts by file type
   - Aggregate counts by source
   - Aggregate counts by date range

---

## Tech Stack

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| **Runtime** | Node.js | 20.x | JavaScript runtime |
| **Framework** | NestJS | 10.x | API framework |
| **Language** | TypeScript | 5.x | Type safety |
| **ORM** | TypeORM | 0.3.x | PostgreSQL queries |
| **Vector DB** | @qdrant/js-client-rest | 1.x | Qdrant client |
| **Cache** | @nestjs/cache-manager | 2.x | Redis caching |
| **Redis** | ioredis | 5.x | Redis client |
| **Validation** | class-validator | 0.14.x | Request validation |
| **Swagger** | @nestjs/swagger | 7.x | API documentation |
| **Metrics** | @willsoto/nestjs-prometheus | 6.x | Prometheus metrics |
| **Testing** | Jest | 29.x | Unit/integration tests |

---

## Database Access (Read-Only)

The search-api has **read-only** access to the following:

| Database | Collections/Tables | Purpose |
|----------|-------------------|---------|
| PostgreSQL | kms_files | File metadata, full-text search |
| Qdrant | kms_files_default | Vector embeddings (384-dim) |
| Qdrant | kms_files_cloud | Cloud embeddings (1536-dim, optional) |
| Neo4j | File, Folder nodes | Hierarchy queries |
| Redis | search:* keys | Result caching |

---

## API Endpoints

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/search | Unified search endpoint |
| POST | /api/v1/search/keyword | Keyword-only search |
| POST | /api/v1/search/semantic | Semantic-only search |
| GET | /api/v1/search/suggestions | Search suggestions |

### Facets

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/facets | Get facet counts for filters |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| GET | /metrics | Prometheus metrics |

---

## Search Request/Response

### Request DTO

```typescript
// search-request.dto.ts
export class SearchRequestDto {
  @IsString()
  @MinLength(1)
  query: string;

  @IsEnum(SearchMode)
  @IsOptional()
  mode?: SearchMode = SearchMode.HYBRID;

  @ValidateNested()
  @Type(() => SearchFiltersDto)
  @IsOptional()
  filters?: SearchFiltersDto;

  @ValidateNested()
  @Type(() => PaginationDto)
  @IsOptional()
  pagination?: PaginationDto;

  @ValidateNested()
  @Type(() => SearchOptionsDto)
  @IsOptional()
  options?: SearchOptionsDto;
}

export class SearchFiltersDto {
  @IsArray()
  @IsEnum(FileType, { each: true })
  @IsOptional()
  file_types?: FileType[];

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  sources?: string[];

  @ValidateNested()
  @Type(() => DateRangeDto)
  @IsOptional()
  date_range?: DateRangeDto;

  @ValidateNested()
  @Type(() => SizeRangeDto)
  @IsOptional()
  size_range?: SizeRangeDto;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
```

### Response DTO

```typescript
// search-response.dto.ts
export class SearchResponseDto {
  results: SearchResultDto[];
  total: number;
  page: number;
  page_size: number;
  facets?: FacetsDto;
  query_time_ms: number;
}

export class SearchResultDto {
  file_id: string;
  file_name: string;
  file_type: FileType;
  source: string;
  source_name: string;
  size_bytes: number;
  created_at: Date;
  modified_at: Date;
  score: number;
  scores: {
    keyword: number;
    semantic: number;
  };
  snippet?: string;
  highlights?: string[];
}
```

### Example Request

```json
POST /api/v1/search
{
  "query": "machine learning notes",
  "mode": "hybrid",
  "filters": {
    "file_types": ["pdf", "docx"],
    "sources": ["uuid-google-drive"],
    "date_range": {
      "start": "2025-01-01",
      "end": "2026-01-07"
    },
    "size_range": {
      "min_bytes": 0,
      "max_bytes": 10485760
    },
    "tags": ["important"]
  },
  "pagination": {
    "page": 1,
    "page_size": 20
  },
  "options": {
    "include_snippets": true,
    "highlight": true
  }
}
```

### Example Response

```json
{
  "results": [
    {
      "file_id": "uuid",
      "file_name": "ML_Notes.pdf",
      "file_type": "pdf",
      "source": "google_drive",
      "source_name": "My Google Drive",
      "size_bytes": 1048576,
      "created_at": "2025-06-15T10:00:00Z",
      "modified_at": "2025-12-01T14:30:00Z",
      "score": 0.95,
      "scores": {
        "keyword": 0.85,
        "semantic": 0.98
      },
      "snippet": "...machine learning is a subset of artificial intelligence that...",
      "highlights": ["machine", "learning"]
    }
  ],
  "total": 150,
  "page": 1,
  "page_size": 20,
  "facets": {
    "file_types": {
      "pdf": 45,
      "docx": 30,
      "txt": 25
    },
    "sources": {
      "google_drive": 80,
      "local_fs": 70
    }
  },
  "query_time_ms": 120
}
```

---

## Project Structure

```
search-api/
├── src/
│   ├── main.ts                      # Application bootstrap
│   ├── app.module.ts                # Root module
│   │
│   ├── config/
│   │   └── configuration.ts         # Configuration loader
│   │
│   ├── modules/
│   │   ├── search/
│   │   │   ├── search.module.ts
│   │   │   ├── search.controller.ts
│   │   │   ├── search.service.ts    # Search orchestration
│   │   │   ├── dto/
│   │   │   │   ├── search-request.dto.ts
│   │   │   │   └── search-response.dto.ts
│   │   │   └── services/
│   │   │       ├── keyword-search.service.ts
│   │   │       ├── semantic-search.service.ts
│   │   │       └── hybrid-search.service.ts
│   │   │
│   │   ├── facets/
│   │   │   ├── facets.module.ts
│   │   │   ├── facets.controller.ts
│   │   │   └── facets.service.ts
│   │   │
│   │   └── health/
│   │       ├── health.module.ts
│   │       └── health.controller.ts
│   │
│   ├── repositories/
│   │   ├── postgres.repository.ts   # PostgreSQL queries
│   │   ├── qdrant.repository.ts     # Qdrant queries
│   │   └── cache.repository.ts      # Redis cache
│   │
│   ├── ranking/
│   │   ├── hybrid-ranker.ts         # Hybrid score calculation
│   │   └── boost-factors.ts         # Score boost factors
│   │
│   ├── embedding/
│   │   └── embedding-client.ts      # Query embedding generation
│   │
│   └── common/
│       ├── filters/
│       │   └── all-exceptions.filter.ts
│       ├── interceptors/
│       │   ├── logging.interceptor.ts
│       │   └── cache.interceptor.ts
│       └── guards/
│           └── api-key.guard.ts
│
├── test/
│   ├── unit/
│   └── integration/
│
├── package.json
├── tsconfig.json
└── nest-cli.json
```

---

## Hybrid Search Algorithm

### Conceptual Algorithm (Pseudo Code)

```
ALGORITHM: HybridSearch
INPUT: query (string), filters (object), pagination (object)
OUTPUT: SearchResponse with ranked results

1. CHECK CACHE
   cache_key = hash(query + filters)
   IF cache.exists(cache_key) THEN
     RETURN cache.get(cache_key)

2. GENERATE QUERY EMBEDDING
   query_vector = embedding_client.embed(query)

3. EXECUTE SEARCHES IN PARALLEL
   PARALLEL DO:
     keyword_results = keyword_search(query, filters)
     semantic_results = semantic_search(query_vector, filters)
   END PARALLEL

4. MERGE RESULTS
   result_map = {}

   FOR EACH result IN keyword_results:
     result_map[result.file_id] = {
       file_id: result.file_id,
       keyword_score: result.score,
       semantic_score: 0
     }

   FOR EACH result IN semantic_results:
     IF result_map[result.file_id] EXISTS:
       result_map[result.file_id].semantic_score = result.score
     ELSE:
       result_map[result.file_id] = {
         file_id: result.file_id,
         keyword_score: 0,
         semantic_score: result.score
       }

5. CALCULATE HYBRID SCORES
   FOR EACH item IN result_map:
     item.score = (0.4 * item.keyword_score) + (0.6 * item.semantic_score)

6. APPLY BOOST FACTORS
   FOR EACH item IN result_map:
     IF item.is_exact_name_match:
       item.score += 0.2
     IF item.modified_within_30_days:
       item.score += 0.1
     IF item.has_tag("important"):
       item.score += 0.1
     item.score = min(item.score, 1.0)

7. SORT AND PAGINATE
   results = sort(result_map.values(), by: score DESC)
   paginated = results[offset : offset + page_size]

8. FETCH FILE METADATA
   file_ids = paginated.map(r => r.file_id)
   files = database.get_files(file_ids)

   FOR EACH result IN paginated:
     result.file_data = files[result.file_id]

9. CACHE RESULT
   cache.set(cache_key, response, ttl: 5 minutes)

10. RETURN response
```

### High-Level Implementation (TypeScript)

```typescript
// hybrid-search.service.ts
// NOT executable - conceptual implementation

@Injectable()
export class HybridSearchService {
  constructor(
    private keywordSearch: KeywordSearchService,
    private semanticSearch: SemanticSearchService,
    private embeddingClient: EmbeddingClient,
    private cacheService: CacheService,
    private fileRepository: FileRepository,
  ) {}

  async search(request: SearchRequestDto): Promise<SearchResponseDto> {
    const startTime = Date.now();

    // Step 1: Check cache
    const cacheKey = this.buildCacheKey(request);
    const cached = await this.cacheService.get<SearchResponseDto>(cacheKey);
    if (cached) {
      return cached;
    }

    // Step 2: Generate query embedding
    const queryVector = await this.embeddingClient.embed(request.query);

    // Step 3: Execute searches in parallel
    const [keywordResults, semanticResults] = await Promise.all([
      this.keywordSearch.search(request.query, request.filters),
      this.semanticSearch.search(queryVector, request.filters),
    ]);

    // Step 4: Merge results
    const merged = this.mergeResults(keywordResults, semanticResults);

    // Step 5: Calculate hybrid scores
    const scored = this.calculateHybridScores(merged);

    // Step 6: Apply boost factors
    const boosted = this.applyBoostFactors(scored, request.query);

    // Step 7: Sort and paginate
    const sorted = this.sortByScore(boosted);
    const paginated = this.paginate(
      sorted,
      request.pagination?.page || 1,
      request.pagination?.page_size || 20,
    );

    // Step 8: Fetch file metadata
    const fileIds = paginated.map((r) => r.file_id);
    const files = await this.fileRepository.findByIds(fileIds);
    const enriched = this.enrichWithMetadata(paginated, files);

    // Build response
    const response: SearchResponseDto = {
      results: enriched,
      total: sorted.length,
      page: request.pagination?.page || 1,
      page_size: request.pagination?.page_size || 20,
      query_time_ms: Date.now() - startTime,
    };

    // Step 9: Cache result
    await this.cacheService.set(cacheKey, response, 300); // 5 minutes

    return response;
  }

  private mergeResults(
    keywordResults: SearchResult[],
    semanticResults: SearchResult[],
  ): Map<string, MergedResult> {
    const resultMap = new Map<string, MergedResult>();

    // Add keyword results
    for (const result of keywordResults) {
      resultMap.set(result.file_id, {
        file_id: result.file_id,
        keyword_score: result.score,
        semantic_score: 0,
      });
    }

    // Merge semantic results
    for (const result of semanticResults) {
      const existing = resultMap.get(result.file_id);
      if (existing) {
        existing.semantic_score = result.score;
      } else {
        resultMap.set(result.file_id, {
          file_id: result.file_id,
          keyword_score: 0,
          semantic_score: result.score,
        });
      }
    }

    return resultMap;
  }

  private calculateHybridScores(merged: Map<string, MergedResult>): ScoredResult[] {
    const KEYWORD_WEIGHT = 0.4;
    const SEMANTIC_WEIGHT = 0.6;

    return Array.from(merged.values()).map((item) => ({
      ...item,
      score: KEYWORD_WEIGHT * item.keyword_score + SEMANTIC_WEIGHT * item.semantic_score,
    }));
  }

  private applyBoostFactors(results: ScoredResult[], query: string): ScoredResult[] {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return results.map((result) => {
      let boostedScore = result.score;

      // Exact filename match boost
      if (result.file_name?.toLowerCase().includes(query.toLowerCase())) {
        boostedScore += 0.2;
      }

      // Recent file boost
      if (result.modified_at && new Date(result.modified_at) > thirtyDaysAgo) {
        boostedScore += 0.1;
      }

      // Important tag boost
      if (result.tags?.includes('important')) {
        boostedScore += 0.1;
      }

      // Cap at 1.0
      return {
        ...result,
        score: Math.min(boostedScore, 1.0),
      };
    });
  }

  private buildCacheKey(request: SearchRequestDto): string {
    const hash = createHash('sha256');
    hash.update(JSON.stringify({
      query: request.query,
      filters: request.filters,
      page: request.pagination?.page,
      page_size: request.pagination?.page_size,
    }));
    return `search:${hash.digest('hex')}`;
  }
}
```

---

## Keyword Search Service

### High-Level Implementation

```typescript
// keyword-search.service.ts
// NOT executable - conceptual implementation

@Injectable()
export class KeywordSearchService {
  constructor(
    @InjectRepository(FileEntity)
    private fileRepository: Repository<FileEntity>,
  ) {}

  async search(query: string, filters?: SearchFiltersDto): Promise<SearchResult[]> {
    // Build full-text search query
    const queryBuilder = this.fileRepository
      .createQueryBuilder('file')
      .select([
        'file.id',
        'file.file_name',
        'file.file_type',
        // Calculate relevance score using ts_rank
        `ts_rank(
          to_tsvector('english', file.file_name || ' ' || COALESCE(file.extracted_text, '')),
          plainto_tsquery('english', :query)
        ) as score`,
      ])
      .where(
        `to_tsvector('english', file.file_name || ' ' || COALESCE(file.extracted_text, ''))
         @@ plainto_tsquery('english', :query)`,
        { query },
      );

    // Apply filters
    if (filters?.file_types?.length) {
      queryBuilder.andWhere('file.file_type IN (:...types)', {
        types: filters.file_types,
      });
    }

    if (filters?.sources?.length) {
      queryBuilder.andWhere('file.source_id IN (:...sources)', {
        sources: filters.sources,
      });
    }

    if (filters?.date_range) {
      queryBuilder.andWhere('file.created_at BETWEEN :start AND :end', {
        start: filters.date_range.start,
        end: filters.date_range.end,
      });
    }

    // Order by relevance and limit
    queryBuilder
      .orderBy('score', 'DESC')
      .limit(1000);

    const results = await queryBuilder.getRawMany();

    return results.map((r) => ({
      file_id: r.file_id,
      score: parseFloat(r.score) || 0,
    }));
  }
}
```

---

## Semantic Search Service

### High-Level Implementation

```typescript
// semantic-search.service.ts
// NOT executable - conceptual implementation

@Injectable()
export class SemanticSearchService {
  private qdrantClient: QdrantClient;

  constructor(private configService: ConfigService) {
    this.qdrantClient = new QdrantClient({
      url: this.configService.get('QDRANT_URL'),
    });
  }

  async search(
    queryVector: number[],
    filters?: SearchFiltersDto,
  ): Promise<SearchResult[]> {
    // Build Qdrant filter
    const qdrantFilter = this.buildQdrantFilter(filters);

    // Execute vector search
    const searchResult = await this.qdrantClient.search('kms_files_default', {
      vector: queryVector,
      filter: qdrantFilter,
      limit: 1000,
      with_payload: true,
      score_threshold: 0.5, // Minimum similarity
    });

    return searchResult.map((point) => ({
      file_id: point.payload?.file_id as string,
      score: point.score,
    }));
  }

  private buildQdrantFilter(filters?: SearchFiltersDto): Filter | undefined {
    if (!filters) return undefined;

    const conditions: Condition[] = [];

    if (filters.file_types?.length) {
      conditions.push({
        key: 'file_type',
        match: { any: filters.file_types },
      });
    }

    if (filters.sources?.length) {
      conditions.push({
        key: 'source_id',
        match: { any: filters.sources },
      });
    }

    if (conditions.length === 0) return undefined;

    return { must: conditions };
  }
}
```

---

## Configuration

```yaml
# Environment variables
PORT: 8001
NODE_ENV: production

# PostgreSQL (read-only)
DATABASE_URL: postgresql://readonly:pass@postgres:5432/kms

# Qdrant
QDRANT_URL: http://qdrant:6333
QDRANT_COLLECTION: kms_files_default

# Redis
REDIS_URL: redis://redis:6379

# Embedding service (for query vectors)
EMBEDDING_SERVICE_URL: http://embedding-worker:8002

# Search configuration
SEARCH_KEYWORD_WEIGHT: 0.4
SEARCH_SEMANTIC_WEIGHT: 0.6
SEARCH_CACHE_TTL: 300
SEARCH_MAX_RESULTS: 1000
SEARCH_DEFAULT_PAGE_SIZE: 20
```

---

## Error Codes

| Code | Message | HTTP Status |
|------|---------|-------------|
| SEARCH001 | Invalid search query | 400 |
| SEARCH002 | Invalid filter parameters | 400 |
| SEARCH003 | Search timeout exceeded | 504 |
| SEARCH004 | Database connection error | 500 |
| SEARCH005 | Vector database error | 500 |
| SEARCH006 | Rate limit exceeded | 429 |
| SEARCH007 | Embedding generation failed | 500 |

---

## Health Check

```
GET /health

Response:
{
  "status": "healthy",
  "timestamp": "2026-01-07T10:00:00Z",
  "checks": {
    "postgres": "healthy",
    "qdrant": "healthy",
    "redis": "healthy"
  },
  "latency_ms": {
    "postgres": 2,
    "qdrant": 5,
    "redis": 1
  }
}
```

---

## Prometheus Metrics

| Metric | Type | Description |
|--------|------|-------------|
| search_requests_total | Counter | Total search requests |
| search_duration_seconds | Histogram | Search latency distribution |
| search_cache_hits_total | Counter | Cache hit count |
| search_cache_misses_total | Counter | Cache miss count |
| search_results_count | Histogram | Results per query |
| keyword_search_duration_seconds | Histogram | Keyword search time |
| semantic_search_duration_seconds | Histogram | Semantic search time |

---

## Scaling Strategy

| Metric | Threshold | Action |
|--------|-----------|--------|
| CPU | > 70% | Scale up |
| Memory | > 80% | Scale up |
| Latency (p95) | > 400ms | Scale up |
| Instance count | < 2 | Scale up (min 2) |
| Instance count | > 8 | Scale down (max 8) |

---

## Deployment

```yaml
# docker-compose service definition
search-api:
  build:
    context: ./search-api
    target: production
  ports:
    - "8001:8001"
  environment:
    - NODE_ENV=production
    - DATABASE_URL=${DATABASE_READONLY_URL}
    - QDRANT_URL=http://qdrant:6333
    - REDIS_URL=redis://redis:6379
  depends_on:
    - postgres
    - qdrant
    - redis
  deploy:
    replicas: 2
    resources:
      limits:
        cpus: '2'
        memory: 2G
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
    interval: 10s
    timeout: 5s
    retries: 3
```
