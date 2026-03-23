/**
 * Unit tests for JunkPage
 *
 * Covers:
 * 1. Renders error files list when status=ERROR files exist
 * 2. Delete button calls filesApi.delete and removes the row
 * 3. Retry button calls filesApi.retry and moves file out of error list
 * 4. Empty state shown when no error files
 * 5. Bulk delete button appears when files are selected
 */

import * as React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { JunkPage } from '@/components/features/junk/JunkPage';
import type { KmsFile, ListFilesResponse } from '@/lib/api/files';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ERROR_FILE: KmsFile = {
  id: 'file-err-001',
  name: 'corrupted-scan.pdf',
  path: 'Archive/corrupted-scan.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 892_000,
  status: 'ERROR',
  sourceId: 'src-001',
  collectionId: null,
  tags: [],
  indexedAt: null,
  createdAt: '2025-02-28T14:00:00.000Z',
  updatedAt: '2025-02-28T14:05:00.000Z',
};

const INDEXED_FILE: KmsFile = {
  id: 'file-idx-001',
  name: 'good-document.pdf',
  path: 'Docs/good-document.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 204_800,
  status: 'INDEXED',
  sourceId: 'src-001',
  collectionId: null,
  tags: [],
  indexedAt: '2025-03-10T11:00:00.000Z',
  createdAt: '2025-03-10T10:55:00.000Z',
  updatedAt: '2025-03-10T11:00:00.000Z',
};

const ERROR_RESPONSE: ListFilesResponse = {
  items: [ERROR_FILE],
  total: 1,
};

const ALL_RESPONSE: ListFilesResponse = {
  items: [ERROR_FILE, INDEXED_FILE],
  total: 2,
};

const EMPTY_RESPONSE: ListFilesResponse = {
  items: [],
  total: 0,
};

// ---------------------------------------------------------------------------
// Mock API factory
// ---------------------------------------------------------------------------

function makeMockApi(overrides: Partial<{
  list: jest.Mock;
  delete: jest.Mock;
  retry: jest.Mock;
  bulkDelete: jest.Mock;
}> = {}) {
  return {
    list: overrides.list ?? jest.fn().mockImplementation((params) => {
      if (params?.status === 'ERROR') return Promise.resolve(ERROR_RESPONSE);
      return Promise.resolve(ALL_RESPONSE);
    }),
    delete: overrides.delete ?? jest.fn().mockResolvedValue(undefined),
    retry: overrides.retry ?? jest.fn().mockResolvedValue(undefined),
    bulkDelete: overrides.bulkDelete ?? jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    getTranscription: jest.fn(),
  } as unknown as typeof import('@/lib/api/files').filesApi;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JunkPage', () => {
  // ── Test 1: Renders error files list ─────────────────────────────────────

  it('renders the error files list after loading', async () => {
    const api = makeMockApi();
    render(<JunkPage api={api} />);

    // Loading skeleton is shown first
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
    });

    // File name should be visible
    expect(screen.getByText('corrupted-scan.pdf')).toBeInTheDocument();

    // Error Files tab is active
    expect(screen.getByTestId('tab-error')).toBeInTheDocument();
    expect(screen.getByTestId('junk-file-table')).toBeInTheDocument();

    // api.list called with status=ERROR and without
    expect(api.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ERROR' }),
    );
    expect(api.list).toHaveBeenCalledWith(
      expect.not.objectContaining({ status: 'ERROR' }),
    );
  });

  // ── Test 2: Delete calls filesApi.delete ─────────────────────────────────

  it('calls filesApi.delete when Delete button is clicked and removes the row', async () => {
    const mockDelete = jest.fn().mockResolvedValue(undefined);
    const api = makeMockApi({ delete: mockDelete });

    render(<JunkPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText('corrupted-scan.pdf')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole('button', { name: /delete corrupted-scan\.pdf/i });

    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(mockDelete).toHaveBeenCalledWith('file-err-001');

    // Row should be removed
    await waitFor(() => {
      expect(screen.queryByText('corrupted-scan.pdf')).not.toBeInTheDocument();
    });
  });

  // ── Test 3: Retry calls filesApi.retry ───────────────────────────────────

  it('calls filesApi.retry when Retry button is clicked and moves file out of error tab', async () => {
    const mockRetry = jest.fn().mockResolvedValue(undefined);
    const api = makeMockApi({ retry: mockRetry });

    render(<JunkPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText('corrupted-scan.pdf')).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /retry corrupted-scan\.pdf/i });

    await act(async () => {
      fireEvent.click(retryBtn);
    });

    expect(mockRetry).toHaveBeenCalledWith('file-err-001');

    // File should be removed from the error list
    await waitFor(() => {
      expect(screen.queryByText('corrupted-scan.pdf')).not.toBeInTheDocument();
    });
  });

  // ── Test 4: Empty state when no error files ───────────────────────────────

  it('shows empty state when there are no error files', async () => {
    const api = makeMockApi({
      list: jest.fn().mockResolvedValue(EMPTY_RESPONSE),
    });

    render(<JunkPage api={api} />);

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    expect(screen.getByText(/no junk files/i)).toBeInTheDocument();
    expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('junk-file-table')).not.toBeInTheDocument();
  });

  // ── Test 5: Bulk delete button appears when files are selected ────────────

  it('shows bulk delete button when at least one file is selected', async () => {
    const mockBulkDelete = jest.fn().mockResolvedValue(undefined);
    const api = makeMockApi({ bulkDelete: mockBulkDelete });

    render(<JunkPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText('corrupted-scan.pdf')).toBeInTheDocument();
    });

    // Initially no bulk action bar
    expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();

    // Select the file
    const checkbox = screen.getByRole('checkbox', { name: /select corrupted-scan\.pdf/i });
    fireEvent.click(checkbox);

    // Bulk action bar should appear with bulk delete button
    await waitFor(() => {
      expect(screen.getByTestId('bulk-action-bar')).toBeInTheDocument();
    });

    expect(screen.getByTestId('bulk-delete-btn')).toBeInTheDocument();

    // Click bulk delete
    await act(async () => {
      fireEvent.click(screen.getByTestId('bulk-delete-btn'));
    });

    expect(mockBulkDelete).toHaveBeenCalledWith(['file-err-001']);
  });
});
