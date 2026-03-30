'use client';

import { AdminStats } from '@/lib/api/admin';

interface AdminStatsPanelProps {
  stats: AdminStats;
}

/**
 * Formats a byte count into a human-readable storage string (B / KB / MB / GB / TB).
 * Kept local because AdminStatsPanel is the only consumer.
 */
function formatStorageBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * AdminStatsPanel — displays system-wide aggregate counters on the admin dashboard.
 *
 * Renders numeric tiles for user/source/file counts and an embed-pipeline
 * health overview (pending, processing, failed).  The storage usage tile
 * shows the formatted byte total of all non-deleted files.
 *
 * @param props.stats - System stats from GET /admin/stats.
 */
export function AdminStatsPanel({ stats }: AdminStatsPanelProps) {
  // Numeric tiles rendered as localised integers
  const countTiles = [
    { label: 'Total Users',    value: stats.totalUsers,       color: 'text-blue-400' },
    { label: 'Total Sources',  value: stats.totalSources,     color: 'text-purple-400' },
    { label: 'Total Files',    value: stats.totalFiles,       color: 'text-green-400' },
    { label: 'Pending Embeds', value: stats.pendingEmbeds,    color: 'text-yellow-400' },
    { label: 'Processing',     value: stats.processingEmbeds, color: 'text-orange-400' },
    { label: 'Failed Files',   value: stats.failedFiles,      color: 'text-red-400' },
  ];

  return (
    <section aria-label="System statistics">
      <h2 className="text-lg font-semibold text-[#fafafa] mb-4">System Overview</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {countTiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-xl bg-[#1a1a1a] border border-[#2e2e2e] p-4"
          >
            <p className="text-xs text-[#a1a1a1] uppercase tracking-wide mb-1">{tile.label}</p>
            <p className={`text-2xl font-bold ${tile.color}`}>{tile.value.toLocaleString()}</p>
          </div>
        ))}

        {/* Storage usage tile — rendered separately because its value is a
            formatted byte string, not a raw number */}
        <div className="rounded-xl bg-[#1a1a1a] border border-[#2e2e2e] p-4">
          <p className="text-xs text-[#a1a1a1] uppercase tracking-wide mb-1">Storage Used</p>
          <p className="text-2xl font-bold text-cyan-400">
            {formatStorageBytes(stats.storageUsageBytes ?? 0)}
          </p>
        </div>
      </div>
    </section>
  );
}
