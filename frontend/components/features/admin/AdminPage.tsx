'use client';

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

/**
 * AdminPage — the admin dashboard page component.
 *
 * Redirects to `/` if the authenticated user does not have the ADMIN role.
 * Loads all admin data (stats, users, sources, scan jobs) on mount.
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

  // FR-07: redirect non-ADMIN users immediately
  useEffect(() => {
    if (user && !user.roles.includes('ADMIN')) {
      router.replace('/');
    }
  }, [user, router]);

  // Load initial data
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

  // Don't render admin content for non-admin users
  if (!user?.roles.includes('ADMIN')) {
    return null;
  }

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
    <div className="p-6 space-y-10" data-testid="admin-page">
      <div>
        <h1 className="text-2xl font-bold text-[#fafafa] mb-1">Admin Dashboard</h1>
        <p className="text-sm text-[#a1a1a1]">System-wide overview and management</p>
      </div>

      {stats && <AdminStatsPanel stats={stats} />}

      <AdminUsersTable
        users={users}
        nextCursor={usersCursor}
        total={usersTotal}
        onLoadMore={handleLoadMoreUsers}
        loading={loadingUsers}
      />

      <AdminSourcesTable
        sources={sources}
        nextCursor={sourcesCursor}
        total={sourcesTotal}
        onLoadMore={handleLoadMoreSources}
        loading={loadingSources}
      />

      <AdminScanJobsTable jobs={scanJobs} total={scanJobsTotal} />
    </div>
  );
}
