# Search Endpoints

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The Search API provides hybrid search capabilities combining keyword (full-text) and semantic (vector) search with Reciprocal Rank Fusion (RRF).

---

## Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/search` | Execute hybrid search |
| POST | `/search/semantic` | Semantic-only search |
| POST | `/search/keyword` | Keyword-only search |
| GET | `/search/suggestions` | Get search suggestions |
| GET | `/search/history` | Get search history |

---

## Hybrid Search

Execute a combined keyword + semantic search.

```http
POST /api/v1/search
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "query": "quarterly financial performance 2025",
  "options": {
    "mode": "hybrid",
    "keyword_weight": 0.4,
    "semantic_weight": 0.6,
    "limit": 20,
    "offset": 0,
    "min_score": 0.3
  },
  "filters": {
    "source_ids": ["src_abc123"],
    "mime_types": ["application/pdf", "application/vnd.google-apps.document"],
    "extensions": ["pdf", "docx"],
    "date_range": {
      "field": "source_modified_at",
      "from": "2025-01-01T00:00:00Z",
      "to": "2026-01-01T00:00:00Z"
    },
    "path_prefix": "/documents/",
    "exclude_duplicates": true,
    "exclude_junk": true
  },
  "highlight": {
    "enabled": true,
    "max_fragments": 3,
    "fragment_size": 150
  }
}
```

**Response:** `200 OK`

```json
{
  "query": "quarterly financial performance 2025",
  "mode": "hybrid",
  "total_results": 45,
  "results": [
    {
      "file": {
        "id": "file_abc123",
        "name": "Q4-2025-Report.pdf",
        "path": "/documents/reports/Q4-2025-Report.pdf",
        "mime_type": "application/pdf",
        "size_bytes": 2097152,
        "source_id": "src_xyz789"
      },
      "score": 0.87,
      "scores": {
        "combined": 0.87,
        "keyword": 0.82,
        "semantic": 0.91,
        "rrf_rank": 1
      },
      "highlights": [
        "...the <mark>quarterly</mark> <mark>financial</mark> <mark>performance</mark> exceeded expectations in <mark>2025</mark>...",
        "...key metrics showed strong <mark>financial</mark> growth during Q4...",
        "...comparing <mark>2025</mark> results with previous fiscal years..."
      ],
      "matched_chunk": {
        "index": 3,
        "text": "The quarterly financial performance exceeded expectations in 2025, with revenue growth of 15% year-over-year...",
        "page": 2
      }
    },
    {
      "file": {
        "id": "file_def456",
        "name": "Annual-Review-2025.docx",
        "path": "/documents/reviews/Annual-Review-2025.docx",
        "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "size_bytes": 1048576,
        "source_id": "src_xyz789"
      },
      "score": 0.79,
      "scores": {
        "combined": 0.79,
        "keyword": 0.75,
        "semantic": 0.82,
        "rrf_rank": 2
      },
      "highlights": [
        "...<mark>2025</mark> was a transformative year for our <mark>financial</mark> outlook...",
        "...<mark>quarterly</mark> reviews demonstrated consistent <mark>performance</mark>..."
      ],
      "matched_chunk": {
        "index": 1,
        "text": "2025 was a transformative year for our financial outlook, with each quarterly review demonstrating...",
        "page": 1
      }
    }
  ],
  "facets": {
    "mime_types": [
      { "value": "application/pdf", "count": 25 },
      { "value": "application/vnd.google-apps.document", "count": 15 },
      { "value": "text/plain", "count": 5 }
    ],
    "sources": [
      { "id": "src_xyz789", "name": "Work Drive", "count": 30 },
      { "id": "src_abc123", "name": "Personal Drive", "count": 15 }
    ],
    "years": [
      { "value": "2025", "count": 40 },
      { "value": "2024", "count": 5 }
    ]
  },
  "search_metadata": {
    "processing_time_ms": 125,
    "keyword_candidates": 100,
    "semantic_candidates": 100,
    "after_fusion": 45
  },
  "pagination": {
    "offset": 0,
    "limit": 20,
    "total": 45,
    "has_more": true
  }
}
```

---

## Semantic Search

Vector-similarity search only (no keyword matching).

```http
POST /api/v1/search/semantic
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "query": "machine learning model training optimization",
  "options": {
    "limit": 20,
    "min_score": 0.5
  },
  "filters": {
    "source_ids": ["src_abc123"]
  }
}
```

**Response:** `200 OK`

```json
{
  "query": "machine learning model training optimization",
  "mode": "semantic",
  "total_results": 28,
  "results": [
    {
      "file": {
        "id": "file_ghi789",
        "name": "ML-Training-Guide.pdf",
        "path": "/docs/ml/ML-Training-Guide.pdf",
        "mime_type": "application/pdf",
        "size_bytes": 3145728,
        "source_id": "src_abc123"
      },
      "score": 0.94,
      "scores": {
        "semantic": 0.94
      },
      "matched_chunk": {
        "index": 5,
        "text": "Optimizing machine learning model training requires careful consideration of hyperparameters...",
        "page": 8
      }
    }
  ],
  "search_metadata": {
    "processing_time_ms": 85,
    "vector_dimension": 384,
    "model": "all-MiniLM-L6-v2"
  },
  "pagination": {
    "offset": 0,
    "limit": 20,
    "total": 28,
    "has_more": true
  }
}
```

---

## Keyword Search

Full-text search only (PostgreSQL FTS).

```http
POST /api/v1/search/keyword
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "query": "budget proposal 2026",
  "options": {
    "limit": 20,
    "match_type": "phrase"
  },
  "filters": {
    "mime_types": ["application/pdf"]
  },
  "highlight": {
    "enabled": true
  }
}
```

**Response:** `200 OK`

```json
{
  "query": "budget proposal 2026",
  "mode": "keyword",
  "total_results": 12,
  "results": [
    {
      "file": {
        "id": "file_jkl012",
        "name": "Budget-Proposal-2026.pdf",
        "path": "/finance/Budget-Proposal-2026.pdf",
        "mime_type": "application/pdf",
        "size_bytes": 524288,
        "source_id": "src_xyz789"
      },
      "score": 0.92,
      "scores": {
        "keyword": 0.92,
        "ts_rank": 0.45
      },
      "highlights": [
        "This <mark>budget proposal</mark> for <mark>2026</mark> outlines the projected expenditures..."
      ]
    }
  ],
  "search_metadata": {
    "processing_time_ms": 45,
    "fts_config": "english"
  },
  "pagination": {
    "offset": 0,
    "limit": 20,
    "total": 12,
    "has_more": false
  }
}
```

---

## Search Suggestions

Get autocomplete suggestions based on query prefix.

```http
GET /api/v1/search/suggestions
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Query prefix (min 2 chars) |
| `limit` | integer | Max suggestions (default: 10) |

**Response:** `200 OK`

```json
{
  "query": "budget",
  "suggestions": [
    {
      "text": "budget proposal 2026",
      "type": "recent",
      "count": 5
    },
    {
      "text": "budget analysis",
      "type": "popular",
      "count": 12
    },
    {
      "text": "budget review meeting",
      "type": "file_name",
      "file_id": "file_abc123"
    }
  ]
}
```

---

## Search History

Get user's recent search queries.

```http
GET /api/v1/search/history
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Max results (default: 20) |

**Response:** `200 OK`

```json
{
  "searches": [
    {
      "query": "quarterly financial report",
      "mode": "hybrid",
      "results_count": 45,
      "searched_at": "2026-01-07T10:30:00Z"
    },
    {
      "query": "machine learning optimization",
      "mode": "semantic",
      "results_count": 28,
      "searched_at": "2026-01-07T09:15:00Z"
    }
  ]
}
```

---

## Schemas

### Search Request

```typescript
interface SearchRequest {
  query: string;
  options?: SearchOptions;
  filters?: SearchFilters;
  highlight?: HighlightOptions;
}

interface SearchOptions {
  mode?: "hybrid" | "semantic" | "keyword";
  keyword_weight?: number;      // 0.0 - 1.0, default: 0.4
  semantic_weight?: number;     // 0.0 - 1.0, default: 0.6
  limit?: number;               // 1-100, default: 20
  offset?: number;              // default: 0
  min_score?: number;           // 0.0 - 1.0, default: 0.3
  match_type?: "any" | "all" | "phrase";  // For keyword search
}

interface SearchFilters {
  source_ids?: string[];
  mime_types?: string[];
  extensions?: string[];
  date_range?: DateRange;
  path_prefix?: string;
  exclude_duplicates?: boolean;
  exclude_junk?: boolean;
  file_ids?: string[];          // Search within specific files
}

interface DateRange {
  field: "created_at" | "source_modified_at" | "indexed_at";
  from?: string;
  to?: string;
}

interface HighlightOptions {
  enabled?: boolean;            // default: true
  max_fragments?: number;       // default: 3
  fragment_size?: number;       // default: 150
  pre_tag?: string;             // default: "<mark>"
  post_tag?: string;            // default: "</mark>"
}
```

### Search Result

```typescript
interface SearchResult {
  file: FileReference;
  score: number;
  scores: ScoreBreakdown;
  highlights?: string[];
  matched_chunk?: MatchedChunk;
}

interface FileReference {
  id: string;
  name: string;
  path: string;
  mime_type: string;
  size_bytes: number;
  source_id: string;
}

interface ScoreBreakdown {
  combined?: number;
  keyword?: number;
  semantic?: number;
  rrf_rank?: number;
  ts_rank?: number;
}

interface MatchedChunk {
  index: number;
  text: string;
  page?: number;
  section?: string;
}
```

### Search Response

```typescript
interface SearchResponse {
  query: string;
  mode: "hybrid" | "semantic" | "keyword";
  total_results: number;
  results: SearchResult[];
  facets?: Facets;
  search_metadata: SearchMetadata;
  pagination: Pagination;
}

interface Facets {
  mime_types?: FacetValue[];
  sources?: SourceFacet[];
  years?: FacetValue[];
}

interface FacetValue {
  value: string;
  count: number;
}

interface SourceFacet {
  id: string;
  name: string;
  count: number;
}

interface SearchMetadata {
  processing_time_ms: number;
  keyword_candidates?: number;
  semantic_candidates?: number;
  after_fusion?: number;
  vector_dimension?: number;
  model?: string;
  fts_config?: string;
}
```

---

## Search Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `hybrid` | Keyword + Semantic with RRF | General search (recommended) |
| `semantic` | Vector similarity only | Conceptual/meaning-based queries |
| `keyword` | Full-text search only | Exact phrase/term matching |

---

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `keyword_weight` | 0.4 | Weight for keyword scores in RRF |
| `semantic_weight` | 0.6 | Weight for semantic scores in RRF |
| `rrf_k` | 60 | RRF constant (higher = more uniform) |
| `min_score` | 0.3 | Minimum combined score threshold |

---

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_QUERY` | Query is empty or too short |
| `QUERY_TOO_LONG` | Query exceeds 1000 characters |
| `INVALID_FILTER` | Invalid filter parameter |
| `SEARCH_TIMEOUT` | Search exceeded time limit |

