'use client';

/**
 * SearchEmptyState — displayed instead of the results list when there is
 * nothing to show. Covers three distinct situations, each with its own
 * copy and suggestions so users know what to do next.
 *
 * State A — query too short  (query.length < 2)
 *   Reason: the hook is disabled below 2 chars; the user just landed on the
 *   page or cleared the input. Give them a gentle prompt to start typing.
 *
 * State B — no results  (query.length >= 2 && resultCount === 0 && !isError)
 *   Reason: the search ran but matched nothing. Offer concrete next steps:
 *   try broader terms or switch to semantic mode which handles typos better.
 *
 * State C — error  (isError === true)
 *   Reason: the request failed (network, auth, 5xx). Don't show the error
 *   object — just tell the user to check their connection or retry.
 *
 * The parent is responsible for deciding WHEN to show this component —
 * it should be rendered when results.length === 0 and !isLoading.
 */

import { Search, SearchX, AlertTriangle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchEmptyStateProps {
  /** The current query string in the input box. */
  query: string;
  /** Number of results actually returned (0 triggers the no-results state). */
  resultCount: number;
  /** True when the search request threw an error. */
  isError: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders contextual empty-state UI.
 * Returns null when there is no appropriate state to show (i.e. results exist).
 */
export function SearchEmptyState({ query, resultCount, isError }: SearchEmptyStateProps) {
  // ── State C: error ──────────────────────────────────────────────────────
  // Check error first — it can co-exist with resultCount === 0.
  if (isError) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        {/* Warning icon — amber signals a recoverable issue, not a catastrophic failure */}
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 mb-4">
          <AlertTriangle className="w-7 h-7 text-amber-500" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Search unavailable</h2>
        <p className="text-sm text-gray-500 max-w-sm">
          Could not reach the search service. Check your connection and try again.
        </p>
        {/* Concrete action — tells user exactly what to do */}
        <p className="mt-4 text-xs text-gray-400">
          If the problem persists, the search-api service may be restarting — wait a moment and retry.
        </p>
      </div>
    );
  }

  // ── State A: query too short ─────────────────────────────────────────────
  // Shown when the query is empty or only 1 char. The hook is gated at >= 2
  // chars, so no request is fired and we just give the user a prompt.
  if (query.trim().length < 2) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        {/* Neutral search icon — this isn't a failure, just a prompt to start */}
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-indigo-50 mb-4">
          <Search className="w-7 h-7 text-indigo-400" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Search your knowledge base</h2>
        <p className="text-sm text-gray-500 max-w-sm">
          Type at least 2 characters to begin searching across all your indexed files and notes.
        </p>
      </div>
    );
  }

  // ── State B: no results ──────────────────────────────────────────────────
  // The search ran (query >= 2 chars) but returned 0 chunks.
  if (resultCount === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        {/* Search-X icon — communicates "searched but found nothing" clearly */}
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-gray-100 mb-4">
          <SearchX className="w-7 h-7 text-gray-400" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">
          No results for &ldquo;{query}&rdquo;
        </h2>
        <p className="text-sm text-gray-500 max-w-sm mb-4">
          The search ran but found no matching chunks in your indexed content.
        </p>

        {/* Suggestions — actionable next steps so the user isn't stuck */}
        <ul className="text-sm text-gray-500 text-left space-y-1.5">
          <li className="flex items-start gap-2">
            {/* Suggestion 1: simplify query — BM25 requires exact token presence */}
            <span className="mt-0.5 text-gray-300" aria-hidden="true">›</span>
            Try shorter or broader search terms
          </li>
          <li className="flex items-start gap-2">
            {/* Suggestion 2: semantic mode handles paraphrases and typos better */}
            <span className="mt-0.5 text-gray-300" aria-hidden="true">›</span>
            Switch to <strong className="font-medium text-gray-700">Semantic</strong> mode to match by meaning
          </li>
          <li className="flex items-start gap-2">
            {/* Suggestion 3: content might not be indexed yet */}
            <span className="mt-0.5 text-gray-300" aria-hidden="true">›</span>
            Check that the relevant sources have been scanned and embedded
          </li>
        </ul>
      </div>
    );
  }

  // When resultCount > 0, render nothing — the results list handles display
  return null;
}
