/**
 * Unit tests for DuplicatesPage
 *
 * Covers:
 * - Shows loading skeleton while fetching
 * - Renders duplicate groups with correct file counts
 * - "Delete" button calls deleteFile API and removes the row
 * - "Delete All Duplicates" bulk button calls deleteFile for all non-canonical files
 * - Shows empty state when no duplicates exist
 * - Wasted storage summary stats are correct
 * - Group card disappears when all duplicates are deleted
 */

import * as React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import DuplicatesPage from '@/app/[locale]/(dashboard)/duplicates/page';
import * as duplicatesApiModule from '@/lib/api/duplicates';
import type { DuplicatesResponse } from '@/lib/api/duplicates';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/api/duplicates', () => ({
  ...jest.requireActual('@/lib/api/duplicates'),
  duplicatesApi: {
    list: jest.fn(),
    deleteFile: jest.fn(),
  },
}));

const mockDuplicatesApi = duplicatesApiModule.duplicatesApi as jest.Mocked<
  typeof duplicatesApiModule.duplicatesApi
>;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_RESPONSE: DuplicatesResponse = {
  groups: [
    {
      checksum: 'abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abc1',
      totalWastedBytes: 204800,
      files: [
        {
          id: 'file-001',
          originalFilename: 'report-final.pdf',
          fileSize: 204800,
          sourceId: 'src-001',
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        },
        {
          id: 'file-002',
          originalFilename: 'report-final-copy.pdf',
          fileSize: 204800,
          sourceId: 'src-001',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
    },
    {
      checksum: 'def456def456def456def456def456def456def456def456def456def456def4',
      totalWastedBytes: 51200,
      files: [
        {
          id: 'file-003',
          originalFilename: 'notes.txt',
          fileSize: 51200,
          sourceId: 'src-001',
          createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        },
        {
          id: 'file-004',
          originalFilename: 'notes-copy.txt',
          fileSize: 51200,
          sourceId: 'src-002',
          createdAt: new Date().toISOString(),
        },
      ],
    },
  ],
};

const EMPTY_RESPONSE: DuplicatesResponse = { groups: [] };

// ── Helper ───────────────────────────────────────────────────────────────────

function renderPage() {
  return render(<DuplicatesPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DuplicatesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Test 1: Loading skeleton ─────────────────────────────────────────────

  it('shows loading skeleton while the API call is in flight', async () => {
    // Never resolves during this test
    mockDuplicatesApi.list.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
    // Groups list should NOT be rendered yet
    expect(screen.queryByTestId('duplicate-groups-list')).not.toBeInTheDocument();
  });

  // ── Test 2: Renders duplicate groups ────────────────────────────────────

  it('renders duplicate groups with correct file counts after load', async () => {
    mockDuplicatesApi.list.mockResolvedValue(MOCK_RESPONSE);

    renderPage();

    // Wait for the list to appear
    await waitFor(() => {
      expect(screen.getByTestId('duplicate-groups-list')).toBeInTheDocument();
    });

    // Two group cards should be rendered
    const cards = screen.getAllByTestId('duplicate-group-card');
    expect(cards).toHaveLength(2);

    // File rows: 2 per group = 4 total
    const rows = screen.getAllByTestId('duplicate-file-row');
    expect(rows).toHaveLength(4);

    // Canonical files show "Keep" badge
    const keepBadges = screen.getAllByText('Keep');
    expect(keepBadges).toHaveLength(2);

    // Filenames are rendered
    expect(screen.getByText('report-final.pdf')).toBeInTheDocument();
    expect(screen.getByText('report-final-copy.pdf')).toBeInTheDocument();
    expect(screen.getByText('notes.txt')).toBeInTheDocument();
  });

  // ── Test 3: Delete button calls deleteFile API ───────────────────────────

  it('calls deleteFile when a Delete button is clicked and removes the row', async () => {
    mockDuplicatesApi.list.mockResolvedValue(MOCK_RESPONSE);
    mockDuplicatesApi.deleteFile.mockResolvedValue(undefined);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('duplicate-groups-list')).toBeInTheDocument();
    });

    // Click the delete button for "report-final-copy.pdf" (file-002)
    const deleteButton = screen.getByRole('button', {
      name: /delete report-final-copy\.pdf/i,
    });

    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(mockDuplicatesApi.deleteFile).toHaveBeenCalledWith('file-002');

    // After deletion, the group that had only 2 files should disappear
    await waitFor(() => {
      expect(screen.queryByText('report-final-copy.pdf')).not.toBeInTheDocument();
    });
  });

  // ── Test 4: Empty state when no duplicates ──────────────────────────────

  it('shows empty state when the API returns no groups', async () => {
    mockDuplicatesApi.list.mockResolvedValue(EMPTY_RESPONSE);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    expect(screen.getByText(/no duplicates found/i)).toBeInTheDocument();
    expect(screen.getByText(/your knowledge base is clean/i)).toBeInTheDocument();

    // Neither the skeleton nor the groups list should be present
    expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('duplicate-groups-list')).not.toBeInTheDocument();
  });

  // ── Test 5: Summary stats are correct ───────────────────────────────────

  it('shows correct summary stats (group count and wasted bytes)', async () => {
    mockDuplicatesApi.list.mockResolvedValue(MOCK_RESPONSE);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('summary-stats')).toBeInTheDocument();
    });

    // 2 groups, totalWastedBytes = 204800 + 51200 = 256000 bytes = 250 KB
    const stats = screen.getByTestId('summary-stats');
    expect(stats.textContent).toMatch(/2 duplicate groups/i);
    expect(stats.textContent).toMatch(/250\.0 KB wasted/i);
  });

  // ── Test 6: Bulk delete calls deleteFile for all non-canonical files ─────

  it('"Delete All Duplicates" deletes all non-canonical files in the group', async () => {
    mockDuplicatesApi.list.mockResolvedValue(MOCK_RESPONSE);
    mockDuplicatesApi.deleteFile.mockResolvedValue(undefined);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('duplicate-groups-list')).toBeInTheDocument();
    });

    // Click the first "Delete All Duplicates" button (first group card)
    const bulkButtons = screen.getAllByTestId('delete-all-duplicates-btn');
    expect(bulkButtons.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(bulkButtons[0]);
    });

    // Should have deleted file-002 (the only non-canonical file in group 1)
    await waitFor(() => {
      expect(mockDuplicatesApi.deleteFile).toHaveBeenCalledWith('file-002');
    });

    // After bulk delete, that group card should disappear
    await waitFor(() => {
      expect(screen.queryByText('report-final-copy.pdf')).not.toBeInTheDocument();
    });
  });

  // ── Test 7: Group card disappears when it drops to 1 file ───────────────

  it('removes a group card when all duplicates are deleted leaving only one file', async () => {
    mockDuplicatesApi.list.mockResolvedValue(MOCK_RESPONSE);
    mockDuplicatesApi.deleteFile.mockResolvedValue(undefined);

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId('duplicate-group-card')).toHaveLength(2);
    });

    // Delete the second file in the first group
    const deleteButton = screen.getByRole('button', {
      name: /delete report-final-copy\.pdf/i,
    });

    await act(async () => {
      fireEvent.click(deleteButton);
    });

    // First group card (2 files) now has only 1 file → removed from list
    await waitFor(() => {
      const cards = screen.getAllByTestId('duplicate-group-card');
      expect(cards).toHaveLength(1);
    });
  });
});
