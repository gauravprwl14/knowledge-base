'use client';

import { AdminSource } from '@/lib/api/admin';

interface AdminSourcesTableProps {
  sources: AdminSource[];
  nextCursor: string | null;
  total: number;
  onLoadMore?: () => void;
  loading?: boolean;
}

/**
 * AdminSourcesTable — renders a list of knowledge sources for the admin dashboard.
 *
 * @param props.sources - List of source items from GET /admin/sources.
 * @param props.nextCursor - Cursor for the next page (null = last page).
 * @param props.total - Total number of sources across all pages.
 * @param props.onLoadMore - Callback to load the next page.
 * @param props.loading - Whether a fetch is in progress.
 */
export function AdminSourcesTable({
  sources,
  nextCursor,
  total,
  onLoadMore,
  loading = false,
}: AdminSourcesTableProps) {
  return (
    <section aria-label="Source management">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#fafafa]">Sources</h2>
        <span className="text-sm text-[#a1a1a1]">{total.toLocaleString()} total</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#2e2e2e]">
        <table className="w-full text-sm">
          <thead className="bg-[#1a1a1a] text-[#a1a1a1] text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Owner</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Files</th>
              <th className="px-4 py-3 text-left">Last Scanned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2e2e2e]">
            {sources.map((source) => (
              <tr key={source.id} className="bg-[#111111] hover:bg-[#1a1a1a] transition-colors">
                <td className="px-4 py-3 text-[#fafafa]">{source.name}</td>
                <td className="px-4 py-3 text-[#a1a1a1]">{source.type}</td>
                <td className="px-4 py-3 text-[#a1a1a1]">{source.userEmail ?? '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      source.status === 'IDLE' || source.status === 'CONNECTED'
                        ? 'bg-green-500/20 text-green-400'
                        : source.status === 'ERROR'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-[#2e2e2e] text-[#a1a1a1]'
                    }`}
                  >
                    {source.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#a1a1a1]">{source.fileCount.toLocaleString()}</td>
                <td className="px-4 py-3 text-[#a1a1a1]">
                  {source.lastScannedAt ? new Date(source.lastScannedAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && onLoadMore && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-[#1a1a1a] border border-[#2e2e2e] text-[#a1a1a1] hover:text-[#fafafa] hover:bg-[#2e2e2e] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </section>
  );
}
