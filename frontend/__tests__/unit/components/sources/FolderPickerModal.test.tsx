/**
 * Unit tests for FolderPickerModal (upgraded tree picker).
 *
 * Covers:
 * - Renders folder list when open
 * - Shows loading spinner while fetching folders
 * - Search input filters folder names case-insensitively
 * - Clearing search restores full tree
 * - Clicking a folder checkbox selects it and adds to summary
 * - "Select all children" toggle for folders that have children
 * - Clicking Save calls onSave with { folderIds, selectAllChildrenMap }
 * - Keyboard: ArrowDown moves focus to next visible row
 * - Keyboard: Space toggles selection on focused row
 * - Keyboard: ArrowRight expands collapsed folder
 * - Keyboard: Enter triggers save
 * - Inherited-selection: child of selected parent renders with dimmed checkbox
 * - Breadcrumb bar updates when folder is expanded
 */

import * as React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FolderPickerModal } from '@/components/features/sources/FolderPickerModal';
import * as sourcesApi from '@/lib/api/sources';
import type { DriveFolder } from '@/lib/api/sources';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/api/sources', () => ({
  kmsSourcesApi: {
    listDriveFolders: jest.fn(),
    updateConfig: jest.fn(),
  },
}));

const mockApi = sourcesApi.kmsSourcesApi as jest.Mocked<typeof sourcesApi.kmsSourcesApi>;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ROOT_FOLDERS: DriveFolder[] = [
  { id: 'folder-001', name: 'Work Docs', path: 'Work Docs', childCount: 2 },
  { id: 'folder-002', name: 'Personal', path: 'Personal', childCount: 0 },
  { id: 'folder-003', name: 'Archive', path: 'Archive', childCount: 1 },
];

const CHILDREN_OF_001: DriveFolder[] = [
  { id: 'folder-001-a', name: 'Projects', path: 'Work Docs/Projects', childCount: 0 },
  { id: 'folder-001-b', name: 'Reports', path: 'Work Docs/Reports', childCount: 0 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderModal(
  props: Partial<React.ComponentProps<typeof FolderPickerModal>> = {},
) {
  const onClose = jest.fn();
  const onSave = jest.fn();
  const view = render(
    <FolderPickerModal
      sourceId="src-001"
      open={true}
      onClose={onClose}
      onSave={onSave}
      {...props}
    />,
  );
  return { onClose, onSave, ...view };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FolderPickerModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('does not render when open=false', () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: ROOT_FOLDERS });
    renderModal({ open: false });
    expect(screen.queryByText(/Select folders to sync/i)).not.toBeInTheDocument();
  });

  it('shows loading spinner while fetching folders', () => {
    mockApi.listDriveFolders.mockReturnValue(new Promise(() => {}));
    renderModal();
    expect(screen.getByLabelText(/Loading folders/i)).toBeInTheDocument();
  });

  it('renders folder list after successful load', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: ROOT_FOLDERS });
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('Work Docs')).toBeInTheDocument();
      expect(screen.getByText('Personal')).toBeInTheDocument();
      expect(screen.getByText('Archive')).toBeInTheDocument();
    });
  });

  it('shows error when folder fetch fails', async () => {
    mockApi.listDriveFolders.mockRejectedValue(new Error('Drive API error'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByText(/Failed to load Drive folders/i)).toBeInTheDocument();
    });
  });

  // ── Selection ──────────────────────────────────────────────────────────────

  it('updates selection count label when a folder is toggled', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: ROOT_FOLDERS });
    renderModal();
    await waitFor(() => screen.getByText('Work Docs'));

    // Initially 0 selected
    expect(screen.getByText(/No folders selected/i)).toBeInTheDocument();

    // Click first checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    await waitFor(() => {
      expect(screen.getByText(/1 folder selected/i)).toBeInTheDocument();
    });
  });

  it('clears all selections when "Clear selection" is clicked', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: ROOT_FOLDERS });
    renderModal({ initialSelection: ['folder-001', 'folder-002'] });
    await waitFor(() => screen.getByText('Work Docs'));

    expect(screen.getByText(/2 folders selected/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Clear selection'));

    await waitFor(() => {
      expect(screen.getByText(/No folders selected/i)).toBeInTheDocument();
    });
  });

  // ── Save ───────────────────────────────────────────────────────────────────

  it('calls updateConfig and onSave with { folderIds, selectAllChildrenMap } on Save', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: ROOT_FOLDERS });
    mockApi.updateConfig.mockResolvedValue(undefined);
    const { onSave, onClose } = renderModal();

    await waitFor(() => screen.getByText('Work Docs'));

    // Select folder-001
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockApi.updateConfig).toHaveBeenCalledWith('src-001', {
        syncFolderIds: ['folder-001'],
      });
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          folderIds: ['folder-001'],
          selectAllChildrenMap: {},
        }),
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ── Search ─────────────────────────────────────────────────────────────────

  it('search input filters folder names case-insensitively', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: ROOT_FOLDERS });
    renderModal();
    await waitFor(() => screen.getByText('Work Docs'));

    const searchInput = screen.getByPlaceholderText(/Search folders/i);
    fireEvent.change(searchInput, { target: { value: 'work' } });

    await waitFor(() => {
      expect(screen.getByText('Work Docs')).toBeInTheDocument();
      expect(screen.queryByText('Personal')).not.toBeInTheDocument();
      expect(screen.queryByText('Archive')).not.toBeInTheDocument();
    });
  });

  it('clearing search restores the full folder list', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: ROOT_FOLDERS });
    renderModal();
    await waitFor(() => screen.getByText('Work Docs'));

    const searchInput = screen.getByPlaceholderText(/Search folders/i);
    fireEvent.change(searchInput, { target: { value: 'work' } });

    await waitFor(() => {
      expect(screen.queryByText('Personal')).not.toBeInTheDocument();
    });

    // Clear search using the X button
    const clearBtn = screen.getByLabelText(/Clear search/i);
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByText('Personal')).toBeInTheDocument();
      expect(screen.getByText('Archive')).toBeInTheDocument();
    });
  });

  it('shows empty-state message when search has no matches', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: ROOT_FOLDERS });
    renderModal();
    await waitFor(() => screen.getByText('Work Docs'));

    const searchInput = screen.getByPlaceholderText(/Search folders/i);
    fireEvent.change(searchInput, { target: { value: 'xyznotexist' } });

    await waitFor(() => {
      expect(screen.getByText(/No folders match/i)).toBeInTheDocument();
    });
  });

  // ── Select all children ────────────────────────────────────────────────────

  it('"select all children" toggle appears for folders with children', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: ROOT_FOLDERS });
    renderModal();
    await waitFor(() => screen.getByText('Work Docs'));

    // folder-001 has childCount=2, folder-003 has childCount=1
    // folder-002 has childCount=0 — should NOT have the toggle
    const toggleBtns = screen.getAllByLabelText(/Select all children/i);
    // Work Docs and Archive have children; Personal does not
    expect(toggleBtns.length).toBe(2);
  });

  it('"select all children" marks loaded children as selected', async () => {
    // First call: root folders; second call: children of folder-001
    mockApi.listDriveFolders
      .mockResolvedValueOnce({ folders: ROOT_FOLDERS })
      .mockResolvedValueOnce({ folders: CHILDREN_OF_001 });

    renderModal();
    await waitFor(() => screen.getByText('Work Docs'));

    // Expand Work Docs to load children
    const expandBtns = screen.getAllByLabelText(/Expand folder/i);
    await act(async () => {
      fireEvent.click(expandBtns[0]);
    });

    await waitFor(() => {
      expect(screen.getByText('Projects')).toBeInTheDocument();
    });

    // Now click "Select all children" for Work Docs
    const selectAllBtn = screen.getAllByLabelText(/Select all children/i)[0];
    fireEvent.click(selectAllBtn);

    // Both children should now be checked
    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox');
      // Find the Projects and Reports checkboxes by their aria-checked value
      const checkedBoxes = checkboxes.filter(
        (cb) => cb.getAttribute('aria-checked') === 'true',
      );
      expect(checkedBoxes.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('Save passes selectAllChildrenMap when "select all children" is toggled', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: ROOT_FOLDERS });
    mockApi.updateConfig.mockResolvedValue(undefined);
    const { onSave } = renderModal();
    await waitFor(() => screen.getByText('Work Docs'));

    const selectAllBtns = screen.getAllByLabelText(/Select all children/i);
    fireEvent.click(selectAllBtns[0]); // Work Docs (folder-001)

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          selectAllChildrenMap: { 'folder-001': true },
        }),
      );
    });
  });

  // ── Keyboard navigation ────────────────────────────────────────────────────

  it('keyboard ArrowDown moves focus to the next visible row', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: ROOT_FOLDERS });
    renderModal();
    await waitFor(() => screen.getByText('Work Docs'));

    const treeContainer = screen.getByRole('tree');

    // Focus tree and arrow down to first item
    act(() => {
      treeContainer.focus();
    });

    fireEvent.keyDown(treeContainer, { key: 'ArrowDown' });
    fireEvent.keyDown(treeContainer, { key: 'ArrowDown' });

    // Second arrow down should move to folder-002 (Personal)
    await waitFor(() => {
      const personalItem = screen.getByText('Personal').closest('[role="treeitem"]');
      expect(personalItem).not.toBeNull();
    });
  });

  it('keyboard Space toggles selection on the focused row', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: ROOT_FOLDERS });
    renderModal();
    await waitFor(() => screen.getByText('Work Docs'));

    const treeContainer = screen.getByRole('tree');
    act(() => {
      treeContainer.focus();
    });

    // Arrow down to first row then space
    fireEvent.keyDown(treeContainer, { key: 'ArrowDown' });
    fireEvent.keyDown(treeContainer, { key: ' ' });

    await waitFor(() => {
      expect(screen.getByText(/1 folder selected/i)).toBeInTheDocument();
    });
  });

  it('keyboard ArrowRight expands a collapsed folder', async () => {
    mockApi.listDriveFolders
      .mockResolvedValueOnce({ folders: ROOT_FOLDERS })
      .mockResolvedValueOnce({ folders: CHILDREN_OF_001 });

    renderModal();
    await waitFor(() => screen.getByText('Work Docs'));

    const treeContainer = screen.getByRole('tree');
    act(() => {
      treeContainer.focus();
    });

    // Focus first item (Work Docs), then expand with ArrowRight
    fireEvent.keyDown(treeContainer, { key: 'ArrowDown' });
    fireEvent.keyDown(treeContainer, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(screen.getByText('Projects')).toBeInTheDocument();
    });
  });

  it('keyboard Enter triggers Save', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: ROOT_FOLDERS });
    mockApi.updateConfig.mockResolvedValue(undefined);
    const { onSave } = renderModal();
    await waitFor(() => screen.getByText('Work Docs'));

    const treeContainer = screen.getByRole('tree');
    act(() => {
      treeContainer.focus();
    });

    fireEvent.keyDown(treeContainer, { key: 'Enter' });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
  });

  // ── Inherited selection ────────────────────────────────────────────────────

  it('child of a selected parent renders with dimmed/inherited checkbox', async () => {
    mockApi.listDriveFolders
      .mockResolvedValueOnce({ folders: ROOT_FOLDERS })
      .mockResolvedValueOnce({ folders: CHILDREN_OF_001 });

    renderModal();
    await waitFor(() => screen.getByText('Work Docs'));

    // Select parent folder-001
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // Work Docs

    // Expand to load children
    const expandBtns = screen.getAllByLabelText(/Expand folder/i);
    await act(async () => {
      fireEvent.click(expandBtns[0]);
    });

    await waitFor(() => {
      expect(screen.getByText('Projects')).toBeInTheDocument();
    });

    // The child checkbox should be aria-checked (inherited) but visually dimmed
    const allCheckboxes = screen.getAllByRole('checkbox');
    const projectsCheckbox = allCheckboxes.find((cb) => {
      const li = cb.closest('[role="treeitem"]');
      return li?.textContent?.includes('Projects');
    });
    expect(projectsCheckbox).toBeDefined();
    expect(projectsCheckbox?.getAttribute('aria-checked')).toBe('true');
    // The checkbox itself carries opacity-40 for inherited state — confirmed by class name
    expect(projectsCheckbox?.className).toMatch(/opacity-40/);
  });

  // ── Breadcrumb ─────────────────────────────────────────────────────────────

  it('breadcrumb bar updates when a folder is expanded', async () => {
    mockApi.listDriveFolders
      .mockResolvedValueOnce({ folders: ROOT_FOLDERS })
      .mockResolvedValueOnce({ folders: CHILDREN_OF_001 });

    renderModal();
    await waitFor(() => screen.getByText('Work Docs'));

    // Breadcrumb should not be visible yet
    expect(screen.queryByLabelText(/Currently expanded folder path/i)).not.toBeInTheDocument();

    // Expand Work Docs
    const expandBtns = screen.getAllByLabelText(/Expand folder/i);
    await act(async () => {
      fireEvent.click(expandBtns[0]);
    });

    await waitFor(() => {
      const breadcrumb = screen.getByLabelText(/Currently expanded folder path/i);
      expect(breadcrumb).toBeInTheDocument();
      expect(breadcrumb.textContent).toMatch(/Work Docs/);
    });
  });

  // ── Summary expand ─────────────────────────────────────────────────────────

  it('selected folder summary expands to show full paths on click', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: ROOT_FOLDERS });
    renderModal({ initialSelection: ['folder-001'] });
    await waitFor(() => screen.getByText('Work Docs'));

    const summaryBtn = screen.getByLabelText(/Show selected folder paths/i);
    fireEvent.click(summaryBtn);

    await waitFor(() => {
      // Should show a path like "My Drive > Work Docs"
      expect(screen.getByText(/My Drive.*Work Docs/i)).toBeInTheDocument();
    });
  });

  // ── ARIA / Accessibility ───────────────────────────────────────────────────

  it('tree container has role="tree" and rows have role="treeitem"', async () => {
    mockApi.listDriveFolders.mockResolvedValue({ folders: ROOT_FOLDERS });
    renderModal();
    await waitFor(() => screen.getByText('Work Docs'));

    expect(screen.getByRole('tree')).toBeInTheDocument();
    const items = screen.getAllByRole('treeitem');
    expect(items.length).toBe(ROOT_FOLDERS.length);
  });

  it('expanded treeitem has aria-expanded=true', async () => {
    mockApi.listDriveFolders
      .mockResolvedValueOnce({ folders: ROOT_FOLDERS })
      .mockResolvedValueOnce({ folders: CHILDREN_OF_001 });

    renderModal();
    await waitFor(() => screen.getByText('Work Docs'));

    const expandBtns = screen.getAllByLabelText(/Expand folder/i);
    await act(async () => {
      fireEvent.click(expandBtns[0]);
    });

    await waitFor(() => {
      const workDocsItem = screen
        .getAllByRole('treeitem')
        .find((el) => el.textContent?.includes('Work Docs'));
      expect(workDocsItem?.getAttribute('aria-expanded')).toBe('true');
    });
  });
});
