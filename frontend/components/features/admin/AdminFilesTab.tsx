'use client';

/**
 * AdminFilesTab — admin files view with embedding status filter.
 *
 * Self-contained: fetches and owns its own file data so AdminPage only
 * mounts this component when the Files tab is active (avoids unnecessary
 * API calls on initial load).
 */

import * as React from 'react';
import { Skeleton } from '@kb/ui';
import { Badge } from '@kb/ui';
import { getAdminFiles } from '@/lib/api/admin';
import type { AdminFile } from '@/lib/api/admin';

/** Status filter options including "All" sentinel */
type StatusFilter = 'ALL' | 'PENDING' | 'PROCESSING' | 'INDEXED' | 'ERROR';

/**
 * Maps an embedding status string to a Badge colour token.
 */
function fileStatusColor(status: string) {
  switch (status) {
    case 'INDEXED':    return 'green'  as const;
    case 'PENDING':    return 'amber'  as const;
    case 'PROCESSING': return 'blue'   as const;
    case 'ERROR':      return 'red'    as const;
    default:           return 'gray'   as const;
  }
}

/**
 * Formats a byte count as a human-readable size string.
 *
 * @param bytes - Raw byte count, or null when unknown.
 * @returns A formatted string like "1.2 MB", or "—" when bytes is null/zero.
 */
function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * AdminFilesTab — full files management table for admin users.
 *
 * Features:
 * - Status filter bar (All / PENDING / PROCESSING / INDEXED / ERROR)
 * - Paginated table showing file name, status badge, MIME type, user,
 *   source, size, and indexed date
 * - Changing the filter resets pagination
 */
export function AdminFilesTab() {
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('ALL');
  const [files, setFiles] = React.useState<AdminFile[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch first page when filter changes; reset all pagination state on filter change
  React.useEffect(() => {
    setLoading(true);
    setError(null);
    setFiles([]);
    setCursor(null);

    // Pass undefined to omit the status query param when showing all files
    const statusParam = statusFilter === 'ALL' ? undefined : statusFilter;

    getAdminFiles(undefined, 50, statusParam)
      .then((res) => {
        setFiles(res.data);
        setCursor(res.nextCursor);
        setTotal(res.total);
      })
      .catch((err: unknown) => {
        const msg =
          (err as any)?.response?.data?.message ??
          (err as Error)?.message ??
          'Failed to load files';
        setError(msg);
        console.error('[AdminFilesTab]', err);
      })
      .finally(() => setLoading(false));
  }, [statusFilter]);

  /** Appends the next cursor page to the current file list. */
  async function handleLoadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const statusParam = statusFilter === 'ALL' ? undefined : statusFilter;
      const res = await getAdminFiles(cursor, 50, statusParam);
      setFiles((prev) => [...prev, ...res.data]);
      setCursor(res.nextCursor);
    } catch (err: unknown) {
      console.error('[AdminFilesTab] loadMore', err);
    } finally {
      setLoadingMore(false);
    }
  }

  const filters: StatusFilter[] = ['ALL', 'PENDING', 'PROCESSING', 'INDEXED', 'ERROR'];

  // Active filter button styling per status — keeps colours consistent with Badge tokens
  const filterColor: Record<StatusFilter, string> = {
    ALL:        'bg-[#2e2e2e] text-[#fafafa] border-[#3e3e3e]',
    PENDING:    'bg-amber-500/20 text-amber-400 border-amber-500/30',
    PROCESSING: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    INDEXED:    'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    ERROR:      'bg-red-500/20 text-red-400 border-red-500/30',
  };

  const filterInactive = 'bg-transparent text-[#a1a1a1] border-[#2e2e2e] hover:text-[#fafafa] hover:bg-[#1a1a1a]';

  return (
    <section aria-label="All files" data-testid="admin-files-tab">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#fafafa]">Files</h2>
        <span className="text-sm text-[#a1a1a1]">{total.toLocaleString()} total</span>
      </div>

      {/* Status filter bar */}
      <div className="flex flex-wrap gap-2 mb-5">
        {filters.map((f) => {
          const isActive = statusFilter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={[
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                isActive ? filterColor[f] : filterInactive,
              ].join(' ')}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* Error state */}
      {error && (
        <div className="text-red-400 text-sm py-4" role="alert">{error}</div>
      )}

      {/* Loading skeleton — shows a stack of placeholder rows while fetching */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Files table */}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-[#2e2e2e]">
          <table className="w-full text-sm">
            <thead className="bg-[#1a1a1a] text-[#a1a1a1] text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">File Name</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">MIME Type</th>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Source</th>
                <th className="px-4 py-3 text-left">Size</th>
                <th className="px-4 py-3 text-left">Indexed At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2e2e2e]">
              {files.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#a1a1a1]">
                    No files found{statusFilter !== 'ALL' ? ` with status ${statusFilter}` : ''}.
                  </td>
                </tr>
              ) : (
                files.map((file) => (
                  <tr key={file.id} className="bg-[#111111] hover:bg-[#1a1a1a] transition-colors">
                    {/* Truncate long file names with a tooltip fallback */}
                    <td className="px-4 py-3 text-[#fafafa] max-w-[200px] truncate" title={file.name ?? '—'}>
                      {file.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="status" color={fileStatusColor(file.status)}>
                        {file.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[#a1a1a1] text-xs">{file.mimeType ?? '—'}</td>
                    <td className="px-4 py-3 text-[#a1a1a1] text-xs truncate max-w-[140px]" title={file.userEmail ?? '—'}>
                      {file.userEmail ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[#a1a1a1] text-xs truncate max-w-[120px]" title={file.sourceName ?? '—'}>
                      {file.sourceName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[#a1a1a1] text-xs whitespace-nowrap">
                      {formatBytes(file.sizeBytes)}
                    </td>
                    <td className="px-4 py-3 text-[#a1a1a1] text-xs whitespace-nowrap">
                      {file.indexedAt ? new Date(file.indexedAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Load more — only shown when there is a next cursor page available */}
      {cursor && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="px-4 py-2 text-sm rounded-lg bg-[#1a1a1a] border border-[#2e2e2e] text-[#a1a1a1] hover:text-[#fafafa] hover:bg-[#2e2e2e] disabled:opacity-50 transition-colors"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </section>
  );
}
