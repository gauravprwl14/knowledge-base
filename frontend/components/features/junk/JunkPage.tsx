'use client';

/**
 * JunkPage — displays files that failed processing (status=ERROR) or all files
 * for manual review, with per-file delete/retry and bulk delete.
 *
 * Two tabs:
 *   - "Error Files"  → lists files with status=ERROR
 *   - "All Files"    → lists every file (useful for manual quality review)
 */

import * as React from 'react';
import { Trash2, CheckCircle2 } from 'lucide-react';
import { filesApi } from '@/lib/api/files';
import type { KmsFile } from '@/lib/api/files';
import { JunkFileCard } from './JunkFileCard';
import { Skeleton } from '@/components/ui/skeleton';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3" data-testid="loading-skeleton">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

function EmptyState({ tab }: { tab: 'error' | 'all' }) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[50vh] px-6 text-center"
      data-testid="empty-state"
    >
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-6">
        <CheckCircle2 className="w-8 h-8 text-emerald-400" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
        No junk files
      </h2>
      <p className="text-[var(--color-text-secondary)] text-sm max-w-sm">
        {tab === 'error'
          ? 'No files with processing errors were found. Your knowledge base is healthy!'
          : 'No files found. Upload or sync a source to populate your knowledge base.'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type Tab = 'error' | 'all';

// ---------------------------------------------------------------------------
// File table
// ---------------------------------------------------------------------------

interface JunkFileTableProps {
  files: KmsFile[];
  selectedIds: Set<string>;
  onSelectToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeleted: (id: string) => void;
  onRetried: (id: string) => void;
  api: typeof filesApi;
}

function JunkFileTable({
  files,
  selectedIds,
  onSelectToggle,
  onSelectAll,
  onDeleted,
  onRetried,
  api,
}: JunkFileTableProps) {
  const allSelected = files.length > 0 && selectedIds.size === files.length;

  return (
    <div className="overflow-x-auto" data-testid="junk-file-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
            <th className="px-4 py-2.5 text-left w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onSelectAll}
                aria-label="Select all files"
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-[#a78bfa] accent-[#a78bfa]"
              />
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
              File
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide hidden md:table-cell">
              Source
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide hidden sm:table-cell">
              Size
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide hidden sm:table-cell">
              Status
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide hidden lg:table-cell">
              Created
            </th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {files.map((file) => (
            <JunkFileCard
              key={file.id}
              file={file}
              isSelected={selectedIds.has(file.id)}
              onSelectToggle={onSelectToggle}
              onDeleted={onDeleted}
              onRetried={onRetried}
              api={api}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

/**
 * JunkPage — entry point for the /junk route.
 * Accepts an optional `api` prop for test injection (defaults to real filesApi).
 */
export function JunkPage({ api = filesApi }: { api?: typeof filesApi } = {}) {
  const [activeTab, setActiveTab] = React.useState<Tab>('error');
  const [errorFiles, setErrorFiles] = React.useState<KmsFile[]>([]);
  const [allFiles, setAllFiles] = React.useState<KmsFile[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);

  // Load data on mount
  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setPageError(null);

    Promise.all([
      api.list({ status: 'ERROR', limit: 100, sortBy: 'createdAt', sortDir: 'desc' }),
      api.list({ limit: 100, sortBy: 'createdAt', sortDir: 'desc' }),
    ])
      .then(([errorRes, allRes]) => {
        if (!cancelled) {
          setErrorFiles(errorRes.items);
          setAllFiles(allRes.items);
        }
      })
      .catch(() => {
        if (!cancelled) setPageError('Failed to load junk files. Please refresh the page.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api]);

  // Clear selection when tab changes
  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab]);

  const activeFiles = activeTab === 'error' ? errorFiles : allFiles;

  // ── Selection handlers ──────────────────────────────────────────────────

  function handleSelectToggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSelectAll() {
    if (selectedIds.size === activeFiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeFiles.map((f) => f.id)));
    }
  }

  // ── Mutation handlers ───────────────────────────────────────────────────

  function removeFileFromState(id: string) {
    setErrorFiles((prev) => prev.filter((f) => f.id !== id));
    setAllFiles((prev) => prev.filter((f) => f.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function handleRetried(id: string) {
    // Move file out of error list; update status in all-files list
    setErrorFiles((prev) => prev.filter((f) => f.id !== id));
    setAllFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: 'PENDING' as const } : f)),
    );
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    setPageError(null);
    try {
      await api.bulkDelete([...selectedIds]);
      [...selectedIds].forEach(removeFileFromState);
    } catch {
      setPageError('Bulk delete failed. Some files may not have been deleted.');
    } finally {
      setIsBulkDeleting(false);
    }
  }

  // ── Derived stats ───────────────────────────────────────────────────────

  const totalErrorCount = errorFiles.length;
  const totalWastedBytes = errorFiles.reduce((sum, f) => sum + f.sizeBytes, 0);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      {/* Header */}
      <div>
        <h1 className="text-h2 font-bold text-[var(--color-text-primary)]">Junk</h1>
        {!isLoading && !pageError && (
          <p
            className="mt-1 text-body-lg text-[var(--color-text-secondary)]"
            data-testid="summary-bar"
          >
            {totalErrorCount} error {totalErrorCount === 1 ? 'file' : 'files'}
            {totalWastedBytes > 0 && (
              <> &middot; {formatBytes(totalWastedBytes)} wasted</>
            )}
          </p>
        )}
        {!isLoading && !pageError && totalErrorCount === 0 && activeTab === 'error' && (
          <p className="mt-1 text-body-lg text-[var(--color-text-secondary)]">
            Review and clean up low-quality or failed files.
          </p>
        )}
      </div>

      {/* Page-level error banner */}
      {pageError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-red-400">{pageError}</p>
          <button
            onClick={() => setPageError(null)}
            className="text-xs text-red-400 hover:text-red-300 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border)]">
        {(['error', 'all'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            data-testid={`tab-${tab}`}
            className={[
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-[#a78bfa] text-[#a78bfa]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            ].join(' ')}
          >
            {tab === 'error' ? 'Error Files' : 'All Files'}
            <span
              className={[
                'ml-2 rounded-full px-1.5 py-0.5 text-xs',
                activeTab === tab
                  ? 'bg-[#a78bfa]/20 text-[#a78bfa]'
                  : 'bg-white/5 text-[var(--color-text-secondary)]',
              ].join(' ')}
            >
              {tab === 'error' ? errorFiles.length : allFiles.length}
            </span>
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div
          className="flex items-center justify-between rounded-xl border border-[#a78bfa]/20 bg-[#a78bfa]/5 px-4 py-3"
          data-testid="bulk-action-bar"
        >
          <span className="text-sm text-[var(--color-text-primary)]">
            {selectedIds.size} {selectedIds.size === 1 ? 'file' : 'files'} selected
          </span>
          <button
            onClick={handleBulkDelete}
            disabled={isBulkDeleting}
            data-testid="bulk-delete-btn"
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            {isBulkDeleting ? 'Deleting\u2026' : `Delete ${selectedIds.size} files`}
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : activeFiles.length === 0 ? (
        <EmptyState tab={activeTab} />
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] overflow-hidden">
          <JunkFileTable
            files={activeFiles}
            selectedIds={selectedIds}
            onSelectToggle={handleSelectToggle}
            onSelectAll={handleSelectAll}
            onDeleted={removeFileFromState}
            onRetried={handleRetried}
            api={api}
          />
        </div>
      )}
    </div>
  );
}
