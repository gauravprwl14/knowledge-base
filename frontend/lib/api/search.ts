/**
 * Search API — typed wrappers over the /api/v1/search endpoint.
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchMode = 'hybrid' | 'keyword' | 'semantic';

export interface SearchResult {
  fileId: string;
  title: string;
  path: string;
  mimeType: string;
  snippets: string[];
  score: number;
  keywordScore?: number;
  semanticScore?: number;
  sourceId: string;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const searchApi = {
  /**
   * GET /search — performs a hybrid/keyword/semantic search.
   *
   * @param q - Search query string
   * @param mode - Search mode: 'hybrid', 'keyword', or 'semantic'
   * @param limit - Max number of results to return (default 20)
   */
  search: (q: string, mode: SearchMode = 'hybrid', limit = 20): Promise<SearchResult[]> =>
    apiClient.get<SearchResult[]>('/search', {
      params: { q, mode, limit },
    }),
};
