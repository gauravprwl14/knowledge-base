/**
 * AdminPage.test.tsx
 *
 * Unit tests for the AdminPage component — covers:
 * - redirects to `/` when user has USER role (not ADMIN)
 * - renders admin sections when user has ADMIN role
 * - admin nav link is hidden for USER role
 * - admin nav link is visible for ADMIN role
 */

// ---------------------------------------------------------------------------
// Mocks — declared before any import so jest hoisting picks them up
// ---------------------------------------------------------------------------

const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => '/admin',
}));

jest.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  usePathname: () => '/admin',
}));

const mockGetAdminStats = jest.fn();
const mockGetAdminUsers = jest.fn();
const mockGetAdminSources = jest.fn();
const mockGetAdminScanJobs = jest.fn();

jest.mock('@/lib/api/admin', () => ({
  getAdminStats: (...args: unknown[]) => mockGetAdminStats(...args),
  getAdminUsers: (...args: unknown[]) => mockGetAdminUsers(...args),
  getAdminSources: (...args: unknown[]) => mockGetAdminSources(...args),
  getAdminScanJobs: (...args: unknown[]) => mockGetAdminScanJobs(...args),
}));

// Mock auth store — allows per-test user override
let mockUser: { id: string; email: string; name: string; roles: string[]; avatarUrl?: string } | null = null;

jest.mock('@/lib/stores/auth.store', () => ({
  useCurrentUser: () => mockUser,
  authStore: { state: { accessToken: null } },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminPage } from '@/components/features/admin/AdminPage';
import { KmsSidebar } from '@/components/layout/kms-sidebar';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_USER = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin User',
  roles: ['ADMIN'],
};

const REGULAR_USER = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Regular User',
  roles: ['USER'],
};

const MOCK_STATS = {
  totalUsers: 10,
  totalSources: 5,
  totalFiles: 100,
  pendingEmbeds: 7,
  processingEmbeds: 3,
  failedFiles: 2,
};

const MOCK_USERS_RESPONSE = {
  data: [],
  nextCursor: null,
  total: 0,
};

const MOCK_SOURCES_RESPONSE = {
  data: [],
  nextCursor: null,
  total: 0,
};

const MOCK_JOBS_RESPONSE = {
  data: [],
  nextCursor: null,
  total: 0,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdminPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReplace.mockReset();
  });

  describe('role guard', () => {
    it('redirects to / when user has USER role (not ADMIN)', async () => {
      mockUser = REGULAR_USER;

      render(<AdminPage />);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/');
      });
    });

    it('does not redirect when user has ADMIN role', async () => {
      mockUser = ADMIN_USER;

      mockGetAdminStats.mockResolvedValue(MOCK_STATS);
      mockGetAdminUsers.mockResolvedValue(MOCK_USERS_RESPONSE);
      mockGetAdminSources.mockResolvedValue(MOCK_SOURCES_RESPONSE);
      mockGetAdminScanJobs.mockResolvedValue(MOCK_JOBS_RESPONSE);

      render(<AdminPage />);

      // Give effects time to run
      await waitFor(() => {
        expect(mockReplace).not.toHaveBeenCalled();
      });
    });
  });

  describe('admin content', () => {
    beforeEach(() => {
      mockUser = ADMIN_USER;
      mockGetAdminStats.mockResolvedValue(MOCK_STATS);
      mockGetAdminUsers.mockResolvedValue(MOCK_USERS_RESPONSE);
      mockGetAdminSources.mockResolvedValue(MOCK_SOURCES_RESPONSE);
      mockGetAdminScanJobs.mockResolvedValue(MOCK_JOBS_RESPONSE);
    });

    it('renders the admin dashboard heading', async () => {
      render(<AdminPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
      });
    });

    it('renders system overview stats section', async () => {
      render(<AdminPage />);

      await waitFor(() => {
        expect(screen.getByText('System Overview')).toBeInTheDocument();
      });
    });

    it('renders users section', async () => {
      render(<AdminPage />);

      await waitFor(() => {
        expect(screen.getByRole('region', { name: /user management/i })).toBeInTheDocument();
      });
    });

    it('renders sources section', async () => {
      render(<AdminPage />);

      await waitFor(() => {
        expect(screen.getByRole('region', { name: /source management/i })).toBeInTheDocument();
      });
    });

    it('renders scan jobs section', async () => {
      render(<AdminPage />);

      await waitFor(() => {
        expect(screen.getByRole('region', { name: /scan job history/i })).toBeInTheDocument();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Sidebar admin nav link visibility tests
// ---------------------------------------------------------------------------

describe('KmsSidebar — admin nav link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('admin link is hidden for USER role', () => {
    mockUser = REGULAR_USER;
    render(<KmsSidebar />);
    expect(screen.queryByTitle('Admin')).not.toBeInTheDocument();
    // The link text "Admin" should not be in the sidebar
    const links = screen.queryAllByRole('link', { name: /admin/i });
    // Either no link, or only links that aren't the nav Admin item
    expect(links.filter((l) => l.getAttribute('href') === '/admin')).toHaveLength(0);
  });

  it('admin link is visible for ADMIN role', () => {
    mockUser = ADMIN_USER;
    render(<KmsSidebar />);
    // The Admin nav item should appear
    const adminLink = screen.getByRole('link', { name: /admin/i });
    expect(adminLink).toBeInTheDocument();
    expect(adminLink).toHaveAttribute('href', '/admin');
  });
});
