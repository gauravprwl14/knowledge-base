'use client';

/**
 * AdminPage — multi-tab admin dashboard.
 *
 * Tabs:
 * - Overview: system stats + embedding progress bar
 * - Files:    all files across all users with status filter
 * - Users:    paginated user list
 * - Sources:  paginated source list with per-row re-scan
 * - Jobs:     recent scan jobs
 *
 * Non-admin users are redirected to `/` immediately.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/stores/auth.store';
import {
  getAdminStats,
  getAdminUsers,
  getAdminSources,
  getAdminScanJobs,
  AdminStats,
  AdminUser,
  AdminSource,
  AdminScanJob,
} from '@/lib/api/admin';
import { AdminStatsPanel } from './AdminStatsPanel';
import { AdminUsersTable } from './AdminUsersTable';
import { AdminSourcesTable } from './AdminSourcesTable';
import { AdminScanJobsTable } from './AdminScanJobsTable';
import { AdminFilesTab } from './AdminFilesTab';

/** Tab identifiers */
type AdminTab = 'overview' | 'files' | 'users' | 'sources' | 'jobs';

const TAB_LABELS: Record<AdminTab, string> = {
  overview: 'Overview',
  files:    'Files',
  users:    'Users',
  sources:  'Sources',
  jobs:     'Jobs',
};

const TABS: AdminTab[] = ['overview', 'files', 'users', 'sources', 'jobs'];

/**
 * AdminPage — the admin dashboard page component.
 *
 * Redirects to `/` if the authenticated user does not have the ADMIN role.
 * Loads stats, users, sources, and scan jobs on mount in parallel.
 * The Files tab fetches its own data lazily when it is first activated.
 *
 * @example
 * ```tsx
 * // In app/[locale]/(dashboard)/admin/page.tsx
 * export default function AdminPageWrapper() {
 *   return <AdminPage />;
 * }
 * ```
 */
export function AdminPage() {
  const router = useRouter();
  const user = useCurrentUser();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersCursor, setUsersCursor] = useState<string | null>(null);
  const [usersTotal, setUsersTotal] = useState(0);
  const [sources, setSources] = useState<AdminSource[]>([]);
  const [sourcesCursor, setSourcesCursor] = useState<string | null>(null);
  const [sourcesTotal, setSourcesTotal] = useState(0);
  const [scanJobs, setScanJobs] = useState<AdminScanJob[]>([]);
  const [scanJobsTotal, setScanJobsTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingSources, setLoadingSources] = useState(false);

  // Redirect non-admin users immediately — effect runs whenever user identity resolves
  useEffect(() => {
    if (user && !user.roles.includes('ADMIN')) {
      router.replace('/');
    }
  }, [user, router]);

  // Load overview + list data on mount; guarded by role check to avoid 403s
  useEffect(() => {
    if (!user?.roles.includes('ADMIN')) return;

    setLoading(true);
    setError(null);

    Promise.all([
      getAdminStats(),
      getAdminUsers(undefined, 50),
      getAdminSources(undefined, 50),
      getAdminScanJobs(),
    ])
      .then(([statsData, usersData, sourcesData, jobsData]) => {
        setStats(statsData);
        setUsers(usersData.data);
        setUsersCursor(usersData.nextCursor);
        setUsersTotal(usersData.total);
        setSources(sourcesData.data);
        setSourcesCursor(sourcesData.nextCursor);
        setSourcesTotal(sourcesData.total);
        setScanJobs(jobsData.data);
        setScanJobsTotal(jobsData.total);
      })
      .catch((err: unknown) => {
        const msg =
          (err as any)?.response?.data?.message ??
          (err as Error)?.message ??
          'Failed to load admin data';
        setError(msg);
        console.error('[AdminPage]', err);
      })
      .finally(() => setLoading(false));
  }, [user]);

  /** Appends the next cursor page of users to the existing list. */
  const handleLoadMoreUsers = async () => {
    if (!usersCursor) return;
    setLoadingUsers(true);
    try {
      const data = await getAdminUsers(usersCursor, 50);
      setUsers((prev) => [...prev, ...data.data]);
      setUsersCursor(data.nextCursor);
    } catch (err: unknown) {
      console.error('[AdminPage] loadMoreUsers', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  /** Appends the next cursor page of sources to the existing list. */
  const handleLoadMoreSources = async () => {
    if (!sourcesCursor) return;
    setLoadingSources(true);
    try {
      const data = await getAdminSources(sourcesCursor, 50);
      setSources((prev) => [...prev, ...data.data]);
      setSourcesCursor(data.nextCursor);
    } catch (err: unknown) {
      console.error('[AdminPage] loadMoreSources', err);
    } finally {
      setLoadingSources(false);
    }
  };

  // Don't render admin content for non-admin users — avoids a flash of content
  // before the redirect useEffect fires
  if (!user?.roles.includes('ADMIN')) return null;

  if (loading) {
    return (
      <div className="p-6 text-[#a1a1a1]" aria-busy="true">
        Loading admin data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-400" role="alert">
        {error}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="admin-page">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-[#fafafa] mb-1">Admin Dashboard</h1>
        <p className="text-sm text-[#a1a1a1]">System-wide overview and management</p>
      </div>

      {/* Tab bar — role="tablist" + aria-selected on each button for accessibility */}
      <div className="flex gap-1 border-b border-[#2e2e2e]" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab
                ? 'border-[#a78bfa] text-[#fafafa]'
                : 'border-transparent text-[#a1a1a1] hover:text-[#fafafa]',
            ].join(' ')}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Tab content — each panel is only mounted when its tab is active */}
      <div role="tabpanel">
        {activeTab === 'overview' && stats && (
          <AdminStatsPanel stats={stats} />
        )}

        {/* AdminFilesTab is self-contained: it fetches its own data on mount */}
        {activeTab === 'files' && (
          <AdminFilesTab />
        )}

        {activeTab === 'users' && (
          <AdminUsersTable
            users={users}
            nextCursor={usersCursor}
            total={usersTotal}
            onLoadMore={handleLoadMoreUsers}
            loading={loadingUsers}
          />
        )}

        {activeTab === 'sources' && (
          <AdminSourcesTable
            sources={sources}
            nextCursor={sourcesCursor}
            total={sourcesTotal}
            onLoadMore={handleLoadMoreSources}
            loading={loadingSources}
          />
        )}

        {activeTab === 'jobs' && (
          <AdminScanJobsTable jobs={scanJobs} total={scanJobsTotal} />
        )}
      </div>
    </div>
  );
}
