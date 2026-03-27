'use client';

import * as React from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { duplicatesApi, type DuplicateGroup, type DuplicateFile } from '@/lib/api/duplicates';
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

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="loading-skeleton">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-44 w-full rounded-xl" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[50vh] px-6 text-center"
      data-testid="empty-state"
    >
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 mb-6">
        <Copy className="w-8 h-8 text-[var(--color-accent)]" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
        No duplicates found
      </h2>
      <p className="text-[var(--color-text-secondary)] text-sm max-w-sm">
        Your knowledge base is clean! No files with the same SHA-256 checksum were detected.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Duplicate group card
// ---------------------------------------------------------------------------

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  onFileDeleted: (groupChecksum: string, fileId: string) => void;
}

function DuplicateGroupCard({ group, onFileDeleted }: DuplicateGroupCardProps) {
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDeleteFile(file: DuplicateFile) {
    setDeletingId(file.id);
    setError(null);
    try {
      await duplicatesApi.deleteFile(file.id);
      onFileDeleted(group.checksum, file.id);
    } catch {
      setError(`Failed to delete "${file.originalFilename}". Please try again.`);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteAllDuplicates() {
    // Delete all files except the first (canonical/oldest)
    const toDelete = group.files.slice(1);
    setIsBulkDeleting(true);
    setError(null);
    try {
      await Promise.all(toDelete.map((f) => duplicatesApi.deleteFile(f.id)));
      toDelete.forEach((f) => onFileDeleted(group.checksum, f.id));
    } catch {
      setError('Failed to delete some duplicates. Please try again.');
    } finally {
      setIsBulkDeleting(false);
    }
  }

  const wastedLabel = formatBytes(group.totalWastedBytes);
  const count = group.files.length;

  return (
    <div
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-sm overflow-hidden"
      data-testid="duplicate-group-card"
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <Copy className="w-4 h-4 text-[var(--color-text-secondary)]" aria-hidden="true" />
          <span className="font-semibold text-[var(--color-text-primary)]">
            {count} {count === 1 ? 'copy' : 'copies'}
          </span>
          <span className="text-sm text-[var(--color-text-secondary)]">
            &middot; {wastedLabel} wasted
          </span>
        </div>
        <span
          className="text-xs text-[var(--color-text-secondary)] font-mono truncate max-w-[160px]"
          title={group.checksum}
        >
          SHA-256: {group.checksum.slice(0, 12)}&hellip;
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-100 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-500 hover:text-red-700 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Files table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="duplicate-files-table">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              <th className="px-5 py-2.5 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
                Filename
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide hidden md:table-cell">
                Source
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide hidden sm:table-cell">
                Indexed
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide hidden sm:table-cell">
                Size
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {group.files.map((file, index) => {
              const isCanonical = index === 0;
              const isDeleting = deletingId === file.id;
              return (
                <tr
                  key={file.id}
                  className="hover:bg-[var(--color-bg-secondary)] transition-colors"
                  data-testid="duplicate-file-row"
                >
                  <td className="px-5 py-3 text-[var(--color-text-primary)] font-medium truncate max-w-[220px]">
                    {file.originalFilename}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)] hidden md:table-cell font-mono text-xs truncate max-w-[120px]">
                    {file.sourceId.slice(0, 8)}&hellip;
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)] hidden sm:table-cell">
                    {formatDate(file.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)] hidden sm:table-cell">
                    {formatBytes(file.fileSize)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isCanonical ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        Keep
                      </span>
                    ) : (
                      <button
                        onClick={() => handleDeleteFile(file)}
                        disabled={isDeleting || isBulkDeleting}
                        aria-label={`Delete ${file.originalFilename}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" aria-hidden="true" />
                        {isDeleting ? 'Deleting\u2026' : 'Delete'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Card footer — bulk action */}
      {group.files.length > 1 && (
        <div className="px-5 py-3 border-t border-[var(--color-border)] flex justify-end">
          <button
            onClick={handleDeleteAllDuplicates}
            disabled={isBulkDeleting || deletingId !== null}
            data-testid="delete-all-duplicates-btn"
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            {isBulkDeleting ? 'Deleting\u2026' : 'Delete All Duplicates'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * DuplicatesPage — displays all duplicate file groups for the authenticated
 * user, allowing individual or bulk deletion of non-canonical copies.
 */
export default function DuplicatesPage() {
  const [groups, setGroups] = React.useState<DuplicateGroup[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    duplicatesApi
      .list()
      .then((res) => {
        if (!cancelled) setGroups(res.groups);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load duplicates. Please refresh the page.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Removes a file from its group in local state after a successful delete.
   * Groups that drop to fewer than 2 files are removed from the list.
   */
  function handleFileDeleted(groupChecksum: string, fileId: string) {
    setGroups((prev) =>
      prev
        .map((g) => {
          if (g.checksum !== groupChecksum) return g;
          const remaining = g.files.filter((f) => f.id !== fileId);
          // Recalculate wasted bytes based on updated file list
          const totalWastedBytes = remaining
            .slice(1)
            .reduce((sum, f) => sum + f.fileSize, 0);
          return { ...g, files: remaining, totalWastedBytes };
        })
        // Remove groups that no longer have duplicates
        .filter((g) => g.files.length > 1),
    );
  }

  // Summary stats derived from current state
  const totalWasted = groups.reduce((sum, g) => sum + g.totalWastedBytes, 0);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      {/* Header */}
      <div>
        <h1 className="text-h2 font-bold text-[var(--color-text-primary)]">Duplicates</h1>
        {!isLoading && !error && groups.length > 0 && (
          <p
            className="mt-1 text-body-lg text-[var(--color-text-secondary)]"
            data-testid="summary-stats"
          >
            {groups.length} duplicate {groups.length === 1 ? 'group' : 'groups'} &middot;{' '}
            {formatBytes(totalWasted)} wasted
          </p>
        )}
        {!isLoading && !error && groups.length === 0 && (
          <p className="mt-1 text-body-lg text-[var(--color-text-secondary)]">
            Detect and remove duplicate files from your knowledge base.
          </p>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-500 hover:text-red-700 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : groups.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-4" data-testid="duplicate-groups-list">
          {groups.map((group) => (
            <DuplicateGroupCard
              key={group.checksum}
              group={group}
              onFileDeleted={handleFileDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
