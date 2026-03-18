'use client';

/**
 * SearchFilters — horizontal filter bar rendered above the results list.
 *
 * Kept as a horizontal bar (not a sidebar) so the result list can use the
 * full page width on both desktop and mobile without needing a layout shift.
 *
 * Contains:
 *  - Mode toggle: keyword | hybrid | semantic (pill buttons)
 *  - Result count + timing summary (e.g. "42 results in 87 ms")
 *  - Loading shimmer when a new search is in-flight
 */

import type { SearchMode } from '@/lib/api/search';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchFiltersProps {
  /** Currently active search mode — controlled from the parent page. */
  mode: SearchMode;
  /** Called when the user clicks a different mode pill. */
  onModeChange: (mode: SearchMode) => void;
  /** Total matching chunks reported by the backend (before limit). */
  resultCount: number;
  /** Backend wall-clock time for this query, in milliseconds. */
  took: number;
  /** True while a request is in-flight — dims the stats row. */
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Mode options in display order — label shown to users. */
const MODES: Array<{ value: SearchMode; label: string; description: string }> = [
  {
    value: 'keyword',
    label: 'Keyword',
    // Tooltip-style description to help users pick the right mode
    description: 'Exact BM25 text match — best for precise terms',
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    description: 'BM25 + semantic (RRF) — best for most queries',
  },
  {
    value: 'semantic',
    label: 'Semantic',
    description: 'Vector similarity — best for concept/meaning queries',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the mode toggle and result metadata.
 * Only shown when the query has at least 2 characters (parent controls this).
 */
export function SearchFilters({
  mode,
  onModeChange,
  resultCount,
  took,
  isLoading,
}: SearchFiltersProps) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      {/* ------------------------------------------------------------------ */}
      {/* Mode toggle — pill group (radio-button semantics via aria)           */}
      {/* ------------------------------------------------------------------ */}
      <div
        role="group"
        aria-label="Search mode"
        className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg"
      >
        {MODES.map(({ value, label, description }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            title={description}
            onClick={() => onModeChange(value)}
            className={`
              px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150
              ${
                mode === value
                  ? // Active pill — white background + shadow to stand out from the track
                    'bg-white text-indigo-700 shadow-sm'
                  : // Inactive pill — muted text, no background
                    'text-gray-500 hover:text-gray-700'
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Result count + timing                                               */}
      {/* Shows "N results in X ms" — dimmed while loading so the user knows  */}
      {/* the numbers are stale and a fresh result is coming.                 */}
      {/* ------------------------------------------------------------------ */}
      <p
        className={`text-sm transition-opacity duration-150 ${
          isLoading ? 'opacity-40' : 'opacity-100'
        } text-gray-500`}
        aria-live="polite"
        aria-atomic="true"
      >
        {isLoading ? (
          // Skeleton shimmer while loading — avoids "0 results" flash
          <span className="inline-block w-32 h-4 bg-gray-200 rounded animate-pulse" />
        ) : (
          <>
            <span className="font-medium text-gray-700">{resultCount.toLocaleString()}</span>{' '}
            {resultCount === 1 ? 'result' : 'results'}
            {took > 0 && (
              // Only show timing when we have a real value from the backend
              <span className="ml-1 text-gray-400">in {took} ms</span>
            )}
          </>
        )}
      </p>
    </div>
  );
}
