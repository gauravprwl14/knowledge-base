/**
 * Mock handler — Search API
 *
 * Matches the exact shape of `searchApi` in lib/api/search.ts.
 * Uses filterChunks() from search.data.ts for keyword-aware ranking.
 *
 * Swap: set NEXT_PUBLIC_USE_MOCK=true in .env.local.
 */

import { filterChunks } from '../data/search.data';
import type { SearchMode, SearchResponse } from '@/lib/api/search';

const delay = (ms = 200) => new Promise<void>((r) => setTimeout(r, ms));

export const mockSearchApi = {
  async search(query: string, _mode: SearchMode = 'hybrid', limit = 20): Promise<SearchResponse> {
    // Simulate realistic search latency based on mode
    await delay(180 + Math.random() * 120);

    const results = filterChunks(query, limit);
    return {
      results,
      total: results.length,
      searchType: _mode,
      took: Math.round(80 + Math.random() * 120),
    };
  },
};
