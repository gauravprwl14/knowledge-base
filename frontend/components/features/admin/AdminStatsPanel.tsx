'use client';

import { AdminStats } from '@/lib/api/admin';
import { AdminEmbeddingProgress } from './AdminEmbeddingProgress';

interface AdminStatsPanelProps {
  stats: AdminStats;
}

/**
 * AdminStatsPanel — displays system-wide aggregate counters on the admin dashboard.
 *
 * @param props.stats - System stats from GET /admin/stats.
 */
export function AdminStatsPanel({ stats }: AdminStatsPanelProps) {
  const tiles = [
    { label: 'Total Users',    value: stats.totalUsers,        color: 'text-blue-400' },
    { label: 'Total Sources',  value: stats.totalSources,      color: 'text-purple-400' },
    { label: 'Total Files',    value: stats.totalFiles,        color: 'text-green-400' },
    { label: 'Pending Embeds', value: stats.pendingEmbeds,     color: 'text-yellow-400' },
    { label: 'Processing',     value: stats.processingEmbeds,  color: 'text-orange-400' },
    { label: 'Failed Files',   value: stats.failedFiles,       color: 'text-red-400' },
  ];

  return (
    <section aria-label="System statistics" className="space-y-4">
      <h2 className="text-lg font-semibold text-[#fafafa]">System Overview</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl bg-[#1a1a1a] border border-[#2e2e2e] p-4">
            <p className="text-xs text-[#a1a1a1] uppercase tracking-wide mb-1">{tile.label}</p>
            <p className={`text-2xl font-bold ${tile.color}`}>{tile.value.toLocaleString()}</p>
          </div>
        ))}
      </div>
      <AdminEmbeddingProgress stats={stats} />
    </section>
  );
}
