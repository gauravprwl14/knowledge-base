import { AdminPage } from '@/components/features/admin/AdminPage';

/**
 * Admin Dashboard Page — /admin
 *
 * Role-gated: the AdminPage component redirects to `/` if
 * `user.roles` does not include `'ADMIN'`.
 *
 * Implemented as a thin Next.js page wrapper to keep the route
 * registration simple and the business logic in the client component.
 */
export default function AdminPageWrapper() {
  return <AdminPage />;
}
