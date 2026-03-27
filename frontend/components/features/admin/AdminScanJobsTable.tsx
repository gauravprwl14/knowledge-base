'use client';

import { AdminScanJob } from '@/lib/api/admin';

interface AdminScanJobsTableProps {
  jobs: AdminScanJob[];
  total: number;
}

/**
 * AdminScanJobsTable — renders the most recent scan jobs for the admin dashboard.
 *
 * @param props.jobs - List of scan job items from GET /admin/scan-jobs.
 * @param props.total - Total number of jobs returned.
 */
export function AdminScanJobsTable({ jobs, total }: AdminScanJobsTableProps) {
  return (
    <section aria-label="Scan job history">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#fafafa]">Recent Scan Jobs</h2>
        <span className="text-sm text-[#a1a1a1]">Showing {total} most recent</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#2e2e2e]">
        <table className="w-full text-sm">
          <thead className="bg-[#1a1a1a] text-[#a1a1a1] text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Source</th>
              <th className="px-4 py-3 text-left">Owner</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Files Found</th>
              <th className="px-4 py-3 text-left">Started</th>
              <th className="px-4 py-3 text-left">Finished</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2e2e2e]">
            {jobs.map((job) => (
              <tr key={job.id} className="bg-[#111111] hover:bg-[#1a1a1a] transition-colors">
                <td className="px-4 py-3 text-[#fafafa]">{job.sourceName ?? '—'}</td>
                <td className="px-4 py-3 text-[#a1a1a1]">{job.userEmail ?? '—'}</td>
                <td className="px-4 py-3 text-[#a1a1a1]">{job.type}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      job.status === 'COMPLETED'
                        ? 'bg-green-500/20 text-green-400'
                        : job.status === 'FAILED'
                          ? 'bg-red-500/20 text-red-400'
                          : job.status === 'RUNNING'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-[#2e2e2e] text-[#a1a1a1]'
                    }`}
                  >
                    {job.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#a1a1a1]">{job.filesFound.toLocaleString()}</td>
                <td className="px-4 py-3 text-[#a1a1a1]">
                  {job.startedAt ? new Date(job.startedAt).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3 text-[#a1a1a1]">
                  {job.finishedAt ? new Date(job.finishedAt).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
