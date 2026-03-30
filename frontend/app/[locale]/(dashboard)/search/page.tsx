'use client';

/**
 * SearchPage — full-page knowledge-base search.
 *
 * Design decisions:
 * - Query is persisted in the URL (?q=) so results can be shared/bookmarked
 *   and the browser back button restores the previous query.
 * - Mode (hybrid/keyword/semantic) is local state — it's a UI preference,
 *   not something worth bookmarking separately.
 * - The search input here is wider and more prominent than the topbar input;
 *   the topbar just navigates *to* this page, while this input is the main
 *   interactive element.
 * - Skeleton cards are shown while loading instead of a spinner so the page
 *   doesn't feel jumpy — the layout stays stable.
 */

import { useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSearch } from '@/lib/hooks/use-search';
import type { SearchMode } from '@/lib/api/search';
import { SearchResultCard } from '@/components/features/search/SearchResultCard';
import { SearchFilters } from '@/components/features/search/SearchFilters';
import { SearchEmptyState } from '@/components/features/search/SearchEmptyState';

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function SearchPage() {
  // Read the current URL search params so we can initialise from ?q=
  // and update without a full navigation on every keystroke.
  const searchParams = useSearchParams();
  const router = useRouter();

  // Search mode is local state — not in URL because it's a user UI preference,
  // not something another person needs to reproduce the same results.
  const [mode, setMode] = useState<SearchMode>('hybrid');

  // Derive the committed query from the URL — the search fires against this.
  const query = searchParams.get('q') ?? '';

  // inputValue mirrors what the user is typing; it leads the URL by up to 300 ms.
  const [inputValue, setInputValue] = useState(query);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Execute the search — hook is gated to fire only when query >= 2 chars
  const { data, isLoading, isError } = useSearch(query, mode);

  /**
   * Updates the URL ?q= param without triggering a full page navigation.
   * Using router.replace (not push) so typing doesn't flood browser history.
   * Debounced 300 ms so the API is not hit on every keystroke.
   */
  const handleQueryChange = useCallback(
    (newQuery: string) => {
      setInputValue(newQuery);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (newQuery) {
          params.set('q', newQuery);
        } else {
          params.delete('q');
        }
        router.replace(`?${params.toString()}`, { scroll: false });
      }, 300);
    },
    [router, searchParams],
  );

  // Decide whether to show the empty state component.
  // It is shown when not loading AND either query is too short, results = 0, or error.
  const showEmptyState =
    !isLoading && (query.trim().length < 2 || (data?.results.length ?? 0) === 0 || isError);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* ------------------------------------------------------------------ */}
      {/* Search input — larger than topbar, autofocused on mount             */}
      {/* The topbar's search bar is just a shortcut to navigate here; this   */}
      {/* input is the actual working search box on this page.                */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-6">
        <input
          type="search"
          value={inputValue}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search your knowledge base…"
          aria-label="Search query"
          autoFocus
          className="
            w-full text-xl px-5 py-4
            border border-white/10 rounded-xl
            focus:border-[#93c5fd]/50 focus:outline-none focus:ring-2 focus:ring-[#93c5fd]/20
            bg-white/5 text-slate-200 placeholder:text-slate-600
            transition-all duration-150
          "
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Filters + result count                                              */}
      {/* Only shown once the query is long enough to trigger a request —    */}
      {/* no point showing "0 results in 0 ms" for an empty input.           */}
      {/* ------------------------------------------------------------------ */}
      {query.trim().length >= 2 && (
        <SearchFilters
          mode={mode}
          onModeChange={setMode}
          resultCount={data?.total ?? 0}
          took={data?.took ?? 0}
          isLoading={isLoading}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Results list                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-6 space-y-3">
        {/* Skeleton cards — shown while a request is in-flight.              */}
        {/* Using fixed-height placeholders keeps the layout stable and gives  */}
        {/* the user a sense of how many results are coming back.              */}
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 animate-pulse"
              aria-hidden="true"
            >
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-md bg-white/10 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-white/10 rounded w-3/5" />
                  <div className="h-3 bg-white/[0.06] rounded w-2/5" />
                </div>
              </div>
              <div className="space-y-1.5 pl-11">
                <div className="h-3 bg-white/[0.06] rounded w-full" />
                <div className="h-3 bg-white/[0.05] rounded w-4/5" />
              </div>
            </div>
          ))}

        {/* Result cards — rendered once data is available and not loading.   */}
        {/* `data` retains the previous query's results while a new request   */}
        {/* is in-flight (placeholderData in useSearch), but isLoading is     */}
        {/* true in that state so we show skeletons instead.                  */}
        {!isLoading &&
          data?.results.map((result) => (
            <SearchResultCard key={result.id} result={result} query={query} />
          ))}

        {/* Empty / error state — shown after loading completes with no results */}
        {showEmptyState && (
          <SearchEmptyState
            query={query}
            resultCount={data?.results.length ?? 0}
            isError={isError}
          />
        )}
      </div>
    </div>
  );
}
