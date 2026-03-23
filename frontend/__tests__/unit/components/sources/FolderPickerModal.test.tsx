/**
 * Unit tests for FolderPickerModal
 *
 * Covers:
 * - Does not render when open=false
 * - Loads and displays root folders when opened
 * - Shows loading state while fetching
 * - Shows error state when folder fetch fails
 * - Toggling a folder adds/removes it from selection
 * - Save calls updateConfig with selected folder IDs
 * - Clear selection removes all selections
 */

import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FolderPickerModal } from '@/components/features/sources/FolderPickerModal';
import * as sourcesApi from '@/lib/api/sources';
import type { DriveFolder } from '@/lib/api/sources';

// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/api/sources', () => ({
  kmsSourcesApi: {
    listDriveFolders: jest.fn(),
    updateConfig: jest.fn(),
  },
}));

const mockApi = sourcesApi.kmsSourcesApi as jest.Mocked<typeof sourcesApi.kmsSourcesApi>;

// ── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_FOLDERS: DriveFolder[] = [
  { id: 'folder-001', name: 'Work Docs', path: 'Work Docs', childCount: 2 },
  { id: 'folder-002', name: 'Personal', path: 'Personal', childCount: 0 },
];

function renderModal(props: Partial<React.ComponentProps<typeof FolderPickerModal>> = {}) {
  const onClose = jest.fn();
  const onSave = jest.fn();
  render(
    <FolderPickerModal
      sourceId="src-001"
      open={true}
      onClose={onClose}
      onSave={onSave}
      {...props}
    />,
  );
  return { onClose, onSave };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FolderPickerModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when open=false', () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: MOCK_FOLDERS });
    renderModal({ open: false });
    expect(screen.queryByText(/Select folders to sync/i)).not.toBeInTheDocument();
  });

  it('shows loading indicator while fetching folders', async () => {
    // Never resolves during this test
    mockApi.listDriveFolders.mockReturnValue(new Promise(() => {}));
    renderModal();
    expect(screen.getByLabelText(/Loading folders/i)).toBeInTheDocument();
  });

  it('renders folder list after successful load', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: MOCK_FOLDERS });
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('Work Docs')).toBeInTheDocument();
      expect(screen.getByText('Personal')).toBeInTheDocument();
    });
  });

  it('shows error when folder fetch fails', async () => {
    mockApi.listDriveFolders.mockRejectedValue(new Error('Drive API error'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByText(/Failed to load Drive folders/i)).toBeInTheDocument();
    });
  });

  it('updates selection count label when a folder is toggled', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: MOCK_FOLDERS });
    renderModal();

    await waitFor(() => screen.getByText('Work Docs'));

    // Initially 0 selected
    expect(screen.getByText(/No folders selected/i)).toBeInTheDocument();

    // Click "Work Docs" checkbox button
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    await waitFor(() => {
      expect(screen.getByText(/1 folder selected/i)).toBeInTheDocument();
    });
  });

  it('calls updateConfig and onSave with selected folder IDs', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: MOCK_FOLDERS });
    mockApi.updateConfig.mockResolvedValue(undefined);
    const { onSave, onClose } = renderModal();

    await waitFor(() => screen.getByText('Work Docs'));

    // Select "folder-001"
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockApi.updateConfig).toHaveBeenCalledWith('src-001', {
        syncFolderIds: ['folder-001'],
      });
      expect(onSave).toHaveBeenCalledWith(['folder-001']);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('clears all selections when "Clear selection" is clicked', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: MOCK_FOLDERS });
    renderModal({ initialSelection: ['folder-001', 'folder-002'] });

    await waitFor(() => screen.getByText('Work Docs'));

    // Should show 2 selected
    expect(screen.getByText(/2 folders selected/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Clear selection'));

    await waitFor(() => {
      expect(screen.getByText(/No folders selected/i)).toBeInTheDocument();
    });
  });
});
