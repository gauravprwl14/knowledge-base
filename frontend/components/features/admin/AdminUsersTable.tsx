'use client';

import { AdminUser } from '@/lib/api/admin';

interface AdminUsersTableProps {
  users: AdminUser[];
  nextCursor: string | null;
  total: number;
  onLoadMore?: () => void;
  loading?: boolean;
}

/**
 * AdminUsersTable — renders a list of users for the admin dashboard.
 *
 * @param props.users - List of user items from GET /admin/users.
 * @param props.nextCursor - Cursor for the next page (null = last page).
 * @param props.total - Total number of users across all pages.
 * @param props.onLoadMore - Callback to load the next page.
 * @param props.loading - Whether a fetch is in progress.
 */
export function AdminUsersTable({
  users,
  nextCursor,
  total,
  onLoadMore,
  loading = false,
}: AdminUsersTableProps) {
  return (
    <section aria-label="User management">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#fafafa]">Users</h2>
        <span className="text-sm text-[#a1a1a1]">{total.toLocaleString()} total</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#2e2e2e]">
        <table className="w-full text-sm">
          <thead className="bg-[#1a1a1a] text-[#a1a1a1] text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Joined</th>
              <th className="px-4 py-3 text-left">Last Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2e2e2e]">
            {users.map((user) => (
              <tr key={user.id} className="bg-[#111111] hover:bg-[#1a1a1a] transition-colors">
                <td className="px-4 py-3 text-[#fafafa]">{user.email}</td>
                <td className="px-4 py-3 text-[#a1a1a1]">
                  {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      user.role === 'ADMIN'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-[#2e2e2e] text-[#a1a1a1]'
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      user.status === 'ACTIVE'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {user.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#a1a1a1]">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-[#a1a1a1]">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : '—'}
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
