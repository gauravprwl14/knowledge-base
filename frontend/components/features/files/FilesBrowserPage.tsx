'use client';

/**
 * FilesBrowserPage — main orchestrator for the Files browser.
 *
 * Features:
 * - Cursor-based infinite scroll ("Load more" button)
 * - Filter bar (search, MIME group, status, sort)
 * - Grid / table view toggle
 * - Multi-select with bulk delete + bulk re-embed
 * - Bulk delete confirmation modal
 * - Embedding status badges
 * - Loading skeleton and empty state
 */

import * as React from 'react';
import { Files, LayoutGrid, List, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { filesApi } from '@/lib/api/files';
import type { KmsFile } from '@/lib/api/files';
import { ApiError } from '@/lib/api/client';
import { FilesFilterBar, sortOptionToParams } from './FilesFilterBar';
import type { FilesFilterState } from './FilesFilterBar';
import { FileCard } from './FileCard';
import { FilesTable } from './FilesTable';
import { BulkActionToolbar } from './BulkActionToolbar';
import { BulkDeleteConfirmModal } from './BulkDeleteConfirmModal';
import { FilesDrawer } from './FilesDrawer';

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton({ view }: { view: 'grid' | 'table' }) {
  if (view === 'table') {
    return (
      <div className="flex flex-col gap-2" data-testid="loading-skeleton">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="loading-skeleton">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-44 w-full rounded-xl" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  hasFilters: boolean;
  onReset: () => void;
}

function EmptyState({ hasFilters, onReset }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[40vh] px-6 text-center"
      data-testid="empty-state"
    >
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[#93c5fd]/10 border border-[#93c5fd]/20 mb-6">
        <Files className="w-8 h-8 text-[#93c5fd]" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-semibold text-slate-100 mb-2">
        {hasFilters ? 'No files match your filters' : 'No files yet'}
      </h2>
      <p className="text-slate-400 text-sm max-w-sm">
        {hasFilters
          ? 'Try adjusting your search or filters.'
          : 'Connect a source to start indexing files into your knowledge base.'}
      </p>
      {hasFilters && (
        <button
          onClick={onReset}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Clear filters
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default filter state
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: FilesFilterState = {
  search: '',
  mimeGroup: '',
  status: '',
  sort: 'newest',
};

function hasActiveFilters(f: FilesFilterState): boolean {
  return f.search !== '' || f.mimeGroup !== '' || f.status !== '';
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

/**
 * FilesBrowserPage — orchestrates the entire file browsing experience.
 */
export function FilesBrowserPage() {
  const [files, setFiles] = React.useState<KmsFile[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | undefined>(undefined);
  const [total, setTotal] = React.useState<number>(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [filters, setFilters] = React.useState<FilesFilterState>(DEFAULT_FILTERS);
  const [view, setView] = React.useState<'grid' | 'table'>('grid');
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);
  const [isBulkReEmbedding, setIsBulkReEmbedding] = React.useState(false);
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);

  // Track which file is open in the preview drawer (null = drawer closed)
  const [selectedFileId, setSelectedFileId] = React.useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchFiles = React.useCallback(async (f: FilesFilterState, cursor?: string) => {
    const { sortBy, sortDir } = sortOptionToParams(f.sort);
    return filesApi.list({
      cursor,
      limit: 20,
      search: f.search || undefined,
      mimeGroup: f.mimeGroup || undefined,
      status: f.status || undefined,
      sortBy,
      sortDir,
    });
  }, []);

  // Initial/filter-change load
  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setSelectedIds(new Set());

    fetchFiles(filters)
      .then((res) => {
        if (cancelled) return;
        setFiles(res.items);
        setNextCursor(res.nextCursor);
        setTotal(res.total);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load files. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [filters, fetchFiles]);

  // ── Filter handlers ────────────────────────────────────────────────────────

  function handleFiltersChange(next: FilesFilterState) {
    setFilters(next);
  }

  function handleResetFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  // ── Load more ─────────────────────────────────────────────────────────────

  async function handleLoadMore() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await fetchFiles(filters, nextCursor);
      setFiles((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to load more files.');
    } finally {
      setIsLoadingMore(false);
    }
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  function handleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function handleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(files.map((f) => f.id)) : new Set());
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id: string): Promise<void> {
    await filesApi.delete(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  // Opens the confirmation modal
  function handleBulkDeleteClick() {
    if (selectedIds.size === 0) return;
    setShowDeleteModal(true);
  }

  // Confirmed from modal — execute bulk delete
  async function handleBulkDeleteConfirm() {
    if (selectedIds.size === 0 || isBulkDeleting) return;
    setIsBulkDeleting(true);
    setError(null);
    const ids = Array.from(selectedIds);
    // Optimistic: remove rows immediately
    const prevFiles = files;
    const prevTotal = total;
    setFiles((prev) => prev.filter((f) => !ids.includes(f.id)));
    setTotal((t) => Math.max(0, t - ids.length));
    setShowDeleteModal(false);
    try {
      await filesApi.bulkDelete(ids);
      setSelectedIds(new Set());
    } catch (err: unknown) {
      // Restore on error
      setFiles(prevFiles);
      setTotal(prevTotal);
      setError(err instanceof ApiError ? err.message : 'Failed to delete selected files. Please try again.');
    } finally {
      setIsBulkDeleting(false);
    }
  }

  // FR-08: Bulk re-embed
  async function handleBulkReEmbed() {
    if (selectedIds.size === 0 || isBulkReEmbedding) return;
    setIsBulkReEmbedding(true);
    setError(null);
    const ids = Array.from(selectedIds);
    try {
      const result = await filesApi.bulkReEmbed(ids);
      setSelectedIds(new Set());
      // Show inline success message via brief non-blocking info (no toast lib yet)
      // The error state banner doubles as info when non-error; set temporarily then clear.
      setError(`${result.queued} ${result.queued === 1 ? 'file' : 'files'} queued for re-embedding.`);
      setTimeout(() => setError(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to queue files for re-embedding. Please try again.');
    } finally {
      setIsBulkReEmbedding(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const activeFilters = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-h2 font-bold text-slate-100">Files</h1>
          <p className="mt-1 text-body-lg text-slate-400">
            {isLoading ? 'Loading…' : `${total.toLocaleString()} ${total === 1 ? 'file' : 'files'} indexed`}
          </p>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-white/10 p-1 bg-white/5">
          <button
            onClick={() => setView('grid')}
            aria-label="Grid view"
            aria-pressed={view === 'grid'}
            className={[
              'rounded-md p-1.5 transition-colors',
              view === 'grid' ? 'bg-[#a78bfa]/20 text-[#a78bfa]' : 'text-slate-500 hover:text-slate-300',
            ].join(' ')}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => setView('table')}
            aria-label="Table view"
            aria-pressed={view === 'table'}
            className={[
              'rounded-md p-1.5 transition-colors',
              view === 'table' ? 'bg-[#a78bfa]/20 text-[#a78bfa]' : 'text-slate-500 hover:text-slate-300',
            ].join(' ')}
          >
            <List className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <FilesFilterBar filters={filters} onChange={handleFiltersChange} />

      {/* Bulk action toolbar (FR-04) */}
      {selectedIds.size > 0 && (
        <BulkActionToolbar
          selectedCount={selectedIds.size}
          onDeleteClick={handleBulkDeleteClick}
          onReEmbedClick={handleBulkReEmbed}
          onClearSelection={() => setSelectedIds(new Set())}
          isDeleting={isBulkDeleting}
          isReEmbedding={isBulkReEmbedding}
        />
      )}

      {/* Bulk delete confirmation modal (FR-05) */}
      {showDeleteModal && (
        <BulkDeleteConfirmModal
          count={selectedIds.size}
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={handleBulkDeleteConfirm}
          isDeleting={isBulkDeleting}
        />
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-400 hover:text-red-300 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Content area */}
      {isLoading ? (
        <LoadingSkeleton view={view} />
      ) : files.length === 0 ? (
        <EmptyState hasFilters={activeFilters} onReset={handleResetFilters} />
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="files-grid">
          {files.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              selected={selectedIds.has(file.id)}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onOpen={setSelectedFileId}
            />
          ))}
        </div>
      ) : (
        <FilesTable
          files={files}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onSelectAll={handleSelectAll}
          onDelete={handleDelete}
        />
      )}

      {/* Load more */}
      {!isLoading && nextCursor && (
        <div className="flex justify-center pt-2">
          <button
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            data-testid="load-more-btn"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-5 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50 transition-colors"
          >
            {isLoadingMore ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading…
              </>
            ) : (
              'Load more'
            )}
          </button>
        </div>
      )}

      {/* File preview drawer — mounts once, slides in when selectedFileId is non-null */}
      <FilesDrawer
        fileId={selectedFileId}
        onClose={() => setSelectedFileId(null)}
      />
    </div>
  );
}
