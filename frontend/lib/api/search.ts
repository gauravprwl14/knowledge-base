/**
 * Search API — typed wrappers over the /api/v1/search endpoint.
 *
 * Routes through kms-api (/search) which proxies to the search-api service
 * on port 8001. Uses the shared apiClient (Axios + JWT) rather than raw fetch
 * so auth, refresh, and error normalisation are handled consistently.
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types — aligned to the actual search-api response schema
// ---------------------------------------------------------------------------

/** Controls which retrieval strategy the search-api uses. */
export type SearchMode = 'hybrid' | 'keyword' | 'semantic';

/**
 * A single ranked chunk returned by the search-api.
 * Each result represents one embedded chunk (not a whole file).
 */
export interface SearchResult {
  /** Chunk-level UUID — unique per result row. */
  id: string;
  /** UUID of the parent file this chunk belongs to. */
  fileId: string;
  /** Original filename (e.g. "design-notes.md"). */
  filename: string;
  /** The raw chunk text — displayed verbatim in the UI as the snippet. */
  content: string;
  /** Reciprocal-rank fusion score, normalised 0–1. Higher = more relevant. */
  score: number;
  /** Zero-based position of this chunk within its parent file. */
  chunkIndex: number;
  /** Arbitrary extra metadata stored alongside the embedding (e.g. headings, page). */
  metadata: Record<string, unknown>;
}

/**
 * Top-level response envelope from GET /search.
 * `results` is already ranked; `took` is in milliseconds.
 */
export interface SearchResponse {
  results: SearchResult[];
  /** Total number of matching chunks (before limit is applied). */
  total: number;
  /** Which retrieval mode was actually used (backend may override). */
  searchType: string;
  /** Wall-clock time the search took in the backend, in milliseconds. */
  took: number;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

const _realSearchApi = {
  search: (query: string, mode: SearchMode = 'hybrid', limit = 20): Promise<SearchResponse> =>
    apiClient.get<SearchResponse>('/search', {
      params: { q: query, type: mode, limit },
    }),
};

// ── Mock swap ───────────────────────────────────────────────────────────────
// To use real API: remove NEXT_PUBLIC_USE_MOCK from .env.local (or set to false).

import { mockSearchApi } from '@/lib/mock/handlers/search.mock';
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';

export const searchApi = USE_MOCK ? mockSearchApi : _realSearchApi;
