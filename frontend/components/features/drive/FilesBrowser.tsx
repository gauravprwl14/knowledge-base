'use client';

/**
 * FilesBrowser — main container for the file browser experience.
 *
 * Layout:
 *   [FilesFilterPanel (left)] | [FilesToolbar (top) + grid/list area (main)]
 *
 * State managed here:
 *  - selectedIds  — Set<string> of selected file IDs
 *  - viewMode     — 'grid' | 'list'
 *  - sort         — { field, dir }
 *  - filters      — ActiveFilters (source, mimeGroup, statuses, collection, tags)
 *  - search       — string (debounced in FilesToolbar before hitting this state)
 *
 * Pagination: infinite scroll via "Load more" button (cursor-based).
 * BulkActionBar appears at the bottom when any file is selected.
 */

import * as React from 'react';
import { FilesFilterPanel } from './FilesFilterPanel';
import { FilesToolbar } from './FilesToolbar';
import { FileCard } from './FileCard';
import { FileRow } from './FileRow';
import { BulkActionBar } from './BulkActionBar';
import { useFiles, useBulkDeleteFiles, useBulkTagFiles } from '@/lib/hooks/use-files';
import { useAddFilesToCollection } from '@/lib/hooks/use-collections';
import { useSources } from '@/lib/hooks/use-sources';
import type { ActiveFilters } from './FilesFilterPanel';
import type { ViewMode, SortState } from './FilesToolbar';
import type { KmsFile } from '@/lib/api/files';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-bg-secondary)]">
        {/* Empty folder icon */}
        <svg
          className="h-8 w-8 text-[var(--color-text-secondary)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
          />
        </svg>
      </div>
      <div>
        <p className="font-semibold text-[var(--color-text-primary)]">
          {hasFilters ? 'No files match your filters' : 'No files yet'}
        </p>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {hasFilters
            ? 'Try adjusting or clearing your filters.'
            : 'Connect a source and start a scan to populate your knowledge base.'}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton grid
// ---------------------------------------------------------------------------

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-44 animate-pulse rounded-xl bg-[var(--color-bg-secondary)]"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton list
// ---------------------------------------------------------------------------

function SkeletonList() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-lg bg-[var(--color-bg-secondary)]"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Full-page file browser: filters sidebar + toolbar + grid/list + bulk actions.
 */
export function FilesBrowser() {
  // ---- Selection state ----
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  // ---- View / sort state ----
  const [viewMode, setViewMode] = React.useState<ViewMode>('grid');
  const [sort, setSort] = React.useState<SortState>({ field: 'createdAt', dir: 'desc' });

  // ---- Filter state ----
  const [filters, setFilters] = React.useState<ActiveFilters>({
    statuses: [],
    tags: [],
  });
  const [search, setSearch] = React.useState('');

  // ---- Pagination cursor ----
  // We accumulate pages of files in allFiles; nextCursor tracks the next page
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [allFiles, setAllFiles] = React.useState<KmsFile[]>([]);

  // Build API params from current UI state
  const apiParams = React.useMemo(
    () => ({
      cursor,
      limit: 24,
      sourceId: filters.sourceId,
      mimeGroup: filters.mimeGroup,
      // If multiple statuses selected, pass only the first (API limitation);
      // a multi-status filter would require a backend change
      status: filters.statuses[0],
      collectionId: filters.collectionId,
      tags: filters.tags.length ? filters.tags : undefined,
      search: search || undefined,
      sortBy: sort.field,
      sortDir: sort.dir,
    }),
    [cursor, filters, search, sort],
  );

  const { data, isLoading, isError } = useFiles(apiParams);

  // Accumulate fetched pages into allFiles
  // When filters/sort/search change (cursor resets to undefined), start fresh
  const prevParamsRef = React.useRef<typeof apiParams>(apiParams);
  React.useEffect(() => {
    const prev = prevParamsRef.current;
    const filtersChanged =
      prev.sourceId !== apiParams.sourceId ||
      prev.mimeGroup !== apiParams.mimeGroup ||
      prev.status !== apiParams.status ||
      prev.collectionId !== apiParams.collectionId ||
      prev.tags !== apiParams.tags ||
      prev.search !== apiParams.search ||
      prev.sortBy !== apiParams.sortBy ||
      prev.sortDir !== apiParams.sortDir;

    if (filtersChanged) {
      // Reset accumulated list when filters change
      setAllFiles([]);
      setCursor(undefined);
    } else if (data?.items) {
      // Append new page items
      setAllFiles((prev) => (cursor ? [...prev, ...data.items] : data.items));
    }
    prevParamsRef.current = apiParams;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Reset accumulated list when filters/sort/search change
  // (separate effect to ensure setCursor triggers a re-fetch)
  React.useEffect(() => {
    setAllFiles([]);
    setCursor(undefined);
    setSelectedIds(new Set());
  }, [filters, search, sort]);

  // ---- Source name lookup ----
  const { data: sources } = useSources();
  const sourceNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (sources ?? []).forEach((s) => {
      map.set(s.id, s.displayName ?? s.type);
    });
    return map;
  }, [sources]);

  // ---- Mutations ----
  const bulkDelete = useBulkDeleteFiles();
  const bulkTag = useBulkTagFiles();
  const addToCollection = useAddFilesToCollection();

  // ---- Selection helpers ----
  function handleSelect(id: string, selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // ---- Bulk action handlers ----
  async function handleBulkDelete() {
    try {
      await bulkDelete.mutateAsync(Array.from(selectedIds));
      clearSelection();
      // Reset accumulated list so deleted files disappear
      setAllFiles([]);
      setCursor(undefined);
    } catch {
      // Error surfaced by TanStack Query's error state — no-op here
    }
  }

  function handleBulkAddToCollection(collectionId: string) {
    addToCollection.mutate({ collectionId, fileIds: Array.from(selectedIds) });
  }

  function handleBulkAddTag(tagId: string) {
    bulkTag.mutate({ tagId, fileIds: Array.from(selectedIds) });
  }

  // ---- Single-file action handlers (forwarded from cards/rows) ----
  async function handleSingleDelete(id: string) {
    try {
      await bulkDelete.mutateAsync([id]);
      setAllFiles((prev) => prev.filter((f) => f.id !== id));
    } catch {
      // Error surfaced by TanStack Query's error state — no-op here
    }
  }

  function handleSingleAddToCollection(id: string) {
    // Set selection to just this file then open collection picker via state
    // For simplicity, we select just the one file — user can bulk-select separately
    setSelectedIds(new Set([id]));
  }

  // ---- Derived state ----
  const hasFilters =
    !!filters.sourceId ||
    !!filters.mimeGroup ||
    filters.statuses.length > 0 ||
    !!filters.collectionId ||
    filters.tags.length > 0 ||
    !!search;

  const total = data?.total ?? 0;
  const nextCursor = data?.nextCursor;
  const hasMore = !!nextCursor;
  const isMutating = bulkDelete.isPending || bulkTag.isPending || addToCollection.isPending;
  const anySelected = selectedIds.size > 0;

  return (
    <div className="flex min-h-0 flex-1 gap-6">
      {/* ------------------------------------------------------------------ */}
      {/* Left: filter sidebar                                                */}
      {/* ------------------------------------------------------------------ */}
      <FilesFilterPanel filters={filters} onChange={setFilters} />

      {/* ------------------------------------------------------------------ */}
      {/* Right: toolbar + file grid/list                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Toolbar */}
        <FilesToolbar
          count={allFiles.length}
          total={total}
          search={search}
          onSearchChange={setSearch}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sort={sort}
          onSortChange={setSort}
          isLoading={isLoading}
        />

        {/* Error state */}
        {isError && !isLoading && (
          <p className="text-sm text-[var(--color-text-danger)]" role="alert">
            Failed to load files. Please try refreshing the page.
          </p>
        )}

        {/* Loading skeleton — first page only */}
        {isLoading && allFiles.length === 0 && (
          viewMode === 'grid' ? <SkeletonGrid /> : <SkeletonList />
        )}

        {/* Empty state */}
        {!isLoading && !isError && allFiles.length === 0 && (
          <EmptyState hasFilters={hasFilters} />
        )}

        {/* Grid view */}
        {viewMode === 'grid' && allFiles.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {allFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                isSelected={selectedIds.has(file.id)}
                anySelected={anySelected}
                onSelect={handleSelect}
                onDelete={handleSingleDelete}
                onAddToCollection={handleSingleAddToCollection}
              />
            ))}
          </div>
        )}

        {/* List view */}
        {viewMode === 'list' && allFiles.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  <th className="w-10 px-3 py-3" />
                  <th className="w-10 px-2 py-3" />
                  <th className="px-3 py-3">Name</th>
                  <th className="hidden px-3 py-3 md:table-cell">Source</th>
                  <th className="hidden px-3 py-3 lg:table-cell">Size</th>
                  <th className="hidden px-3 py-3 lg:table-cell">Date</th>
                  <th className="hidden px-3 py-3 sm:table-cell">Status</th>
                  <th className="hidden px-3 py-3 xl:table-cell">Tags</th>
                  <th className="w-24 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {allFiles.map((file) => (
                  <FileRow
                    key={file.id}
                    file={file}
                    sourceName={sourceNameMap.get(file.sourceId) ?? 'Unknown'}
                    isSelected={selectedIds.has(file.id)}
                    anySelected={anySelected}
                    onSelect={handleSelect}
                    onDelete={handleSingleDelete}
                    onAddToCollection={handleSingleAddToCollection}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Load more button — cursor pagination */}
        {hasMore && !isLoading && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => setCursor(nextCursor)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-6 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]"
            >
              Load more
            </button>
          </div>
        )}

        {/* Inline loading indicator for subsequent pages */}
        {isLoading && allFiles.length > 0 && (
          <div className="flex justify-center pt-2" aria-label="Loading more files">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bulk action bar — fixed bottom, only visible when files selected    */}
      {/* ------------------------------------------------------------------ */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onClearSelection={clearSelection}
        onDelete={handleBulkDelete}
        onAddToCollection={handleBulkAddToCollection}
        onAddTag={handleBulkAddTag}
        isPending={isMutating}
      />
    </div>
  );
}
