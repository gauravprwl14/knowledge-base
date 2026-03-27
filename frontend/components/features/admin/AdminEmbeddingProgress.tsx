'use client';

/**
 * AdminEmbeddingProgress — visual progress bar for the embedding pipeline.
 *
 * Computes the percentage of files that have been indexed from the stats
 * already loaded by AdminPage (no additional API call needed).  Rendered
 * inside the Overview tab of the admin dashboard.
 */

import { ProgressBar } from '@kb/ui';
import { Badge } from '@kb/ui';
import type { AdminStats } from '@/lib/api/admin';

interface AdminEmbeddingProgressProps {
  stats: AdminStats;
}

/**
 * Returns a colour token appropriate for a file status label.
 * Used to drive Badge colour in the breakdown row.
 */
function statusColor(status: 'INDEXED' | 'PENDING' | 'PROCESSING' | 'ERROR') {
  switch (status) {
    case 'INDEXED':    return 'green'  as const;
    case 'PENDING':    return 'amber'  as const;
    case 'PROCESSING': return 'blue'   as const;
    case 'ERROR':      return 'red'    as const;
  }
}

/**
 * AdminEmbeddingProgress — shows a progress bar and status breakdown for
 * the embedding pipeline.
 *
 * @param props.stats - System stats from GET /admin/stats.
 */
export function AdminEmbeddingProgress({ stats }: AdminEmbeddingProgressProps) {
  // Derive indexed count from the other four counters to avoid an extra DB
  // query — total = indexed + pending + processing + failed + (any other)
  const indexedCount = Math.max(
    0,
    stats.totalFiles - stats.pendingEmbeds - stats.processingEmbeds - stats.failedFiles,
  );

  // Progress as 0–100 integer percentage
  const pct = stats.totalFiles > 0
    ? Math.round((indexedCount / stats.totalFiles) * 100)
    : 0;

  const breakdown = [
    { label: 'INDEXED',    count: indexedCount,           color: statusColor('INDEXED') },
    { label: 'PENDING',    count: stats.pendingEmbeds,    color: statusColor('PENDING') },
    { label: 'PROCESSING', count: stats.processingEmbeds, color: statusColor('PROCESSING') },
    { label: 'ERROR',      count: stats.failedFiles,      color: statusColor('ERROR') },
  ] as const;

  return (
    <div className="rounded-xl bg-[#1a1a1a] border border-[#2e2e2e] p-4 space-y-3">
      {/* Header row: label + numeric summary */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#fafafa]">Embedding Progress</h3>
        <span className="text-sm text-[#a1a1a1]">
          {indexedCount.toLocaleString()} / {stats.totalFiles.toLocaleString()} indexed
          {' '}
          <span className="text-[#fafafa] font-medium">({pct}%)</span>
        </span>
      </div>

      {/* Progress bar */}
      <ProgressBar
        value={pct}
        color={pct === 100 ? 'green' : pct > 0 ? 'blue' : 'amber'}
      />

      {/* Status breakdown chips */}
      <div className="flex flex-wrap gap-2">
        {breakdown.map(({ label, count, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <Badge variant="status" color={color}>
              {label}
            </Badge>
            <span className="text-xs text-[#a1a1a1]">{count.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
