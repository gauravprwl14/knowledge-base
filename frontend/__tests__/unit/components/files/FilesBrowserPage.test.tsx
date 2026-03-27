/**
 * Unit tests for FilesBrowserPage
 *
 * Covers:
 * 1. Shows loading skeleton on initial load
 * 2. Renders file list after data loads
 * 3. Search input filters files (debounced)
 * 4. MIME group filter button works
 * 5. Delete file calls filesApi.delete
 * 6. Bulk delete button appears when files selected
 */

// ---------------------------------------------------------------------------
// Mocks — declared before any imports so jest hoisting works
// ---------------------------------------------------------------------------

const mockFilesList = jest.fn();
const mockFilesDelete = jest.fn();
const mockFilesBulkDelete = jest.fn();
const mockFilesBulkReEmbed = jest.fn();

jest.mock('@/lib/api/files', () => ({
  filesApi: {
    list: (...args: unknown[]) => mockFilesList(...args),
    delete: (...args: unknown[]) => mockFilesDelete(...args),
    bulkDelete: (...args: unknown[]) => mockFilesBulkDelete(...args),
    bulkReEmbed: (...args: unknown[]) => mockFilesBulkReEmbed(...args),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilesBrowserPage } from '@/components/features/files/FilesBrowserPage';
import type { KmsFile, ListFilesResponse } from '@/lib/api/files';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFile(overrides: Partial<KmsFile> = {}): KmsFile {
  return {
    id: 'file-001',
    name: 'document.pdf',
    path: '/docs/document.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024 * 512, // 512 KB
    status: 'INDEXED',
    sourceId: 'src-001',
    collectionId: null,
    tags: [],
    indexedAt: '2025-03-10T10:00:00.000Z',
    createdAt: '2025-03-10T10:00:00.000Z',
    updatedAt: '2025-03-10T10:00:00.000Z',
    ...overrides,
  };
}

const MOCK_FILES: KmsFile[] = [
  makeFile({ id: 'file-001', name: 'research-paper.pdf', mimeType: 'application/pdf', status: 'INDEXED' }),
  makeFile({ id: 'file-002', name: 'meeting-notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', status: 'PROCESSING' }),
  makeFile({ id: 'file-003', name: 'budget.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', status: 'INDEXED', sizeBytes: 2048 }),
];

function makeListResponse(items: KmsFile[], nextCursor?: string): ListFilesResponse {
  return { items, nextCursor, total: items.length };
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderPage() {
  return render(<FilesBrowserPage />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FilesBrowserPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // ── Test 1: Loading skeleton ─────────────────────────────────────────────

  it('shows loading skeleton while the initial API call is in flight', async () => {
    // Never resolves → keeps the component in loading state
    mockFilesList.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('files-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('files-table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  // ── Test 2: Renders file list after data loads ───────────────────────────

  it('renders file cards after the API resolves', async () => {
    mockFilesList.mockResolvedValue(makeListResponse(MOCK_FILES));

    renderPage();

    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
    });

    // Grid should be visible
    expect(screen.getByTestId('files-grid')).toBeInTheDocument();

    // All file cards rendered
    const cards = screen.getAllByTestId('file-card');
    expect(cards).toHaveLength(3);

    // File names are displayed
    expect(screen.getByText('research-paper.pdf')).toBeInTheDocument();
    expect(screen.getByText('meeting-notes.docx')).toBeInTheDocument();
    expect(screen.getByText('budget.xlsx')).toBeInTheDocument();
  });

  // ── Test 3: Search input filters files (debounced) ───────────────────────

  it('calls the API with search term after 300ms debounce', async () => {
    mockFilesList.mockResolvedValue(makeListResponse(MOCK_FILES));

    renderPage();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
    });

    // Initial call (no search)
    expect(mockFilesList).toHaveBeenCalledTimes(1);
    expect(mockFilesList).toHaveBeenCalledWith(expect.objectContaining({ search: undefined }));

    // Type in the search input
    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'research' } });

    // Should NOT fire immediately
    expect(mockFilesList).toHaveBeenCalledTimes(1);

    // Advance timer past debounce delay
    act(() => {
      jest.advanceTimersByTime(350);
    });

    // Now should have been called with the search term
    await waitFor(() => {
      expect(mockFilesList).toHaveBeenCalledTimes(2);
    });
    expect(mockFilesList).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'research' }),
    );
  });

  // ── Test 4: MIME group filter button works ───────────────────────────────

  it('calls the API with mimeGroup when a type filter button is clicked', async () => {
    mockFilesList.mockResolvedValue(makeListResponse(MOCK_FILES));

    renderPage();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
    });

    // Initial call
    expect(mockFilesList).toHaveBeenCalledTimes(1);

    // Click the "Documents" filter
    const documentsBtn = screen.getByTestId('mime-filter-document');
    fireEvent.click(documentsBtn);

    await waitFor(() => {
      expect(mockFilesList).toHaveBeenCalledTimes(2);
    });

    expect(mockFilesList).toHaveBeenLastCalledWith(
      expect.objectContaining({ mimeGroup: 'document' }),
    );

    // The button should appear active (aria-pressed)
    expect(documentsBtn).toHaveAttribute('aria-pressed', 'true');
  });

  // ── Test 5: Delete file calls filesApi.delete ────────────────────────────

  it('calls filesApi.delete and removes the card when delete is triggered', async () => {
    mockFilesList.mockResolvedValue(makeListResponse(MOCK_FILES));
    mockFilesDelete.mockResolvedValue(undefined);

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId('file-card')).toHaveLength(3);
    });

    // Open the three-dot menu for the first card
    const menuButtons = screen.getAllByRole('button', { name: /file actions/i });
    fireEvent.click(menuButtons[0]);

    // Click "Delete file" in the menu
    const deleteMenuItem = screen.getByRole('menuitem', { name: /delete file/i });
    await act(async () => {
      fireEvent.click(deleteMenuItem);
    });

    // API should have been called with the first file's id
    expect(mockFilesDelete).toHaveBeenCalledWith('file-001');

    // Card should be removed from the grid
    await waitFor(() => {
      expect(screen.getAllByTestId('file-card')).toHaveLength(2);
    });

    expect(screen.queryByText('research-paper.pdf')).not.toBeInTheDocument();
  });

  // ── Test 6: Bulk delete button appears when files are selected ───────────

  it('shows bulk action toolbar when checkboxes are checked, opens modal, and calls bulkDelete on confirm', async () => {
    mockFilesList.mockResolvedValue(makeListResponse(MOCK_FILES));
    mockFilesBulkDelete.mockResolvedValue({ deleted: 2 });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId('file-card')).toHaveLength(3);
    });

    // Bulk action bar should NOT be visible initially
    expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();

    // Select the first two files
    const checkbox1 = screen.getByTestId('checkbox-file-001');
    const checkbox2 = screen.getByTestId('checkbox-file-002');

    fireEvent.click(checkbox1);
    fireEvent.click(checkbox2);

    // Bulk action toolbar should now be visible
    expect(screen.getByTestId('bulk-action-bar')).toBeInTheDocument();
    expect(screen.getByText(/2 files selected/i)).toBeInTheDocument();

    // Click bulk delete — opens confirmation modal
    const bulkDeleteBtn = screen.getByTestId('bulk-delete-btn');
    await act(async () => {
      fireEvent.click(bulkDeleteBtn);
    });

    // Modal should appear
    expect(screen.getByTestId('bulk-delete-confirm-modal')).toBeInTheDocument();
    expect(screen.getByTestId('modal-title')).toHaveTextContent(/delete 2 files/i);

    // Confirm deletion
    const confirmBtn = screen.getByTestId('modal-confirm-btn');
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(mockFilesBulkDelete).toHaveBeenCalledWith(['file-001', 'file-002']);

    // Both cards should be removed (optimistic)
    await waitFor(() => {
      expect(screen.getAllByTestId('file-card')).toHaveLength(1);
    });

    // Bulk action bar should be gone after selection cleared
    await waitFor(() => {
      expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
    });
  });

  // ── Test 6b: Re-embed button calls bulkReEmbed API ───────────────────────

  it('re-embed button calls bulkReEmbed API and clears selection on success', async () => {
    mockFilesList.mockResolvedValue(makeListResponse(MOCK_FILES));
    mockFilesBulkReEmbed.mockResolvedValue({ queued: 2 });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId('file-card')).toHaveLength(3);
    });

    // Select two files
    fireEvent.click(screen.getByTestId('checkbox-file-001'));
    fireEvent.click(screen.getByTestId('checkbox-file-002'));

    expect(screen.getByTestId('bulk-action-bar')).toBeInTheDocument();

    // Click re-embed button
    const reEmbedBtn = screen.getByTestId('bulk-re-embed-btn');
    await act(async () => {
      fireEvent.click(reEmbedBtn);
    });

    expect(mockFilesBulkReEmbed).toHaveBeenCalledWith(['file-001', 'file-002']);

    // Selection cleared after success
    await waitFor(() => {
      expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
    });
  });

  // ── Test 6c: Cancel on modal does not call bulkDelete ─────────────────────

  it('cancelling bulk delete modal does not call bulkDelete API', async () => {
    mockFilesList.mockResolvedValue(makeListResponse(MOCK_FILES));

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId('file-card')).toHaveLength(3);
    });

    fireEvent.click(screen.getByTestId('checkbox-file-001'));

    const bulkDeleteBtn = screen.getByTestId('bulk-delete-btn');
    await act(async () => { fireEvent.click(bulkDeleteBtn); });

    // Modal is shown
    expect(screen.getByTestId('bulk-delete-confirm-modal')).toBeInTheDocument();

    // Click Cancel
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-cancel-btn'));
    });

    // Modal dismissed, API not called
    expect(screen.queryByTestId('bulk-delete-confirm-modal')).not.toBeInTheDocument();
    expect(mockFilesBulkDelete).not.toHaveBeenCalled();
    // Selection still intact
    expect(screen.getByTestId('bulk-action-bar')).toBeInTheDocument();
  });

  // ── Test 6d: Bulk actions disabled when > 100 files selected ─────────────

  it('shows warning and disables actions when > 100 files are selected', async () => {
    const manyFiles = Array.from({ length: 101 }, (_, i) =>
      makeFile({ id: `file-${String(i + 1).padStart(3, '0')}`, name: `file-${i + 1}.pdf` }),
    );
    mockFilesList.mockResolvedValue(makeListResponse(manyFiles));

    renderPage();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
    });

    // Select all 101 via "select all" header checkbox in table view
    // Switch to table view first
    const tableViewBtn = screen.getByRole('button', { name: /table view/i });
    fireEvent.click(tableViewBtn);

    await waitFor(() => {
      expect(screen.getByTestId('files-table')).toBeInTheDocument();
    });

    const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
    fireEvent.click(selectAllCheckbox);

    // Over-limit warning should appear
    await waitFor(() => {
      expect(screen.getByTestId('bulk-over-limit-warning')).toBeInTheDocument();
    });

    // Delete and re-embed buttons should be disabled
    expect(screen.getByTestId('bulk-delete-btn')).toBeDisabled();
    expect(screen.getByTestId('bulk-re-embed-btn')).toBeDisabled();
  });

  // ── Test 7: Empty state when no files ───────────────────────────────────

  it('shows empty state when API returns no files', async () => {
    mockFilesList.mockResolvedValue(makeListResponse([]));

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    expect(screen.getByText(/no files yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('files-grid')).not.toBeInTheDocument();
  });

  // ── Test 8: Load more button appears when there is a next cursor ─────────

  it('shows Load more button when nextCursor is present and loads next page', async () => {
    const firstPage: KmsFile[] = [
      makeFile({ id: 'file-001', name: 'file-1.pdf' }),
      makeFile({ id: 'file-002', name: 'file-2.pdf' }),
    ];
    const secondPage: KmsFile[] = [
      makeFile({ id: 'file-003', name: 'file-3.pdf' }),
    ];

    mockFilesList
      .mockResolvedValueOnce(makeListResponse(firstPage, '20'))
      .mockResolvedValueOnce(makeListResponse(secondPage));

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId('file-card')).toHaveLength(2);
    });

    // "Load more" button should be visible
    const loadMoreBtn = screen.getByTestId('load-more-btn');
    expect(loadMoreBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(loadMoreBtn);
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('file-card')).toHaveLength(3);
    });

    expect(screen.getByText('file-3.pdf')).toBeInTheDocument();

    // Load more button should disappear since second page has no nextCursor
    expect(screen.queryByTestId('load-more-btn')).not.toBeInTheDocument();
  });

  // ── Test 9: Status filter works ─────────────────────────────────────────

  it('calls the API with status filter when a status button is clicked', async () => {
    mockFilesList.mockResolvedValue(makeListResponse(MOCK_FILES));

    renderPage();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
    });

    // Click the "Indexed" status filter
    const indexedBtn = screen.getByTestId('status-filter-INDEXED');
    fireEvent.click(indexedBtn);

    await waitFor(() => {
      expect(mockFilesList).toHaveBeenCalledTimes(2);
    });

    expect(mockFilesList).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'INDEXED' }),
    );
  });
});
