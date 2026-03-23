/**
 * CollectionsPage.test.tsx
 *
 * Unit tests for the Collections page component.
 *
 * Covers:
 * - Renders loading skeleton while fetching
 * - Renders collection cards after load
 * - "New Collection" button opens create form / modal
 * - Create collection calls API and adds to list
 * - Delete collection removes from list
 * - Shows empty state when no collections
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCollectionsList = jest.fn();
const mockCollectionsCreate = jest.fn();
const mockCollectionsUpdate = jest.fn();
const mockCollectionsDelete = jest.fn();
const mockCollectionsRemoveFile = jest.fn();

jest.mock('@/lib/api/collections', () => ({
  collectionsApi: {
    list: (...args: unknown[]) => mockCollectionsList(...args),
    create: (...args: unknown[]) => mockCollectionsCreate(...args),
    update: (...args: unknown[]) => mockCollectionsUpdate(...args),
    delete: (...args: unknown[]) => mockCollectionsDelete(...args),
    removeFile: (...args: unknown[]) => mockCollectionsRemoveFile(...args),
  },
}));

const mockFilesList = jest.fn();

jest.mock('@/lib/api/files', () => ({
  filesApi: {
    list: (...args: unknown[]) => mockFilesList(...args),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollectionsPage from '@/app/[locale]/(dashboard)/collections/page';
import type { KmsCollection } from '@/lib/api/collections';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_COLLECTION_1: KmsCollection = {
  id: 'col-001',
  name: 'Research Papers',
  description: 'Academic papers and studies',
  isDefault: false,
  fileCount: 12,
  createdAt: '2025-01-15T00:00:00.000Z',
  updatedAt: '2025-03-01T00:00:00.000Z',
};

const MOCK_COLLECTION_2: KmsCollection = {
  id: 'col-002',
  name: 'Meeting Notes',
  description: null,
  isDefault: false,
  fileCount: 7,
  createdAt: '2025-02-10T00:00:00.000Z',
  updatedAt: '2025-03-10T00:00:00.000Z',
};

const MOCK_COLLECTION_DEFAULT: KmsCollection = {
  id: 'col-default',
  name: 'My Library',
  description: 'Default collection',
  isDefault: true,
  fileCount: 20,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-03-01T00:00:00.000Z',
};

function renderPage() {
  return render(<CollectionsPage />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CollectionsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('renders loading skeletons while data is fetching', () => {
      // Arrange: never resolve so we stay in loading state
      mockCollectionsList.mockReturnValue(new Promise(() => {}));

      // Act
      renderPage();

      // Assert: The Skeleton component renders divs with animate-pulse class
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Rendered collections
  // -------------------------------------------------------------------------

  describe('collection list rendering', () => {
    it('renders collection cards with name and file count after load', async () => {
      // Arrange
      mockCollectionsList.mockResolvedValue([MOCK_COLLECTION_1, MOCK_COLLECTION_2]);

      // Act
      renderPage();

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Research Papers')).toBeInTheDocument();
        expect(screen.getByText('Meeting Notes')).toBeInTheDocument();
      });
      expect(screen.getByText('12 files')).toBeInTheDocument();
      expect(screen.getByText('7 files')).toBeInTheDocument();
    });

    it('shows description when present', async () => {
      mockCollectionsList.mockResolvedValue([MOCK_COLLECTION_1]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Academic papers and studies')).toBeInTheDocument();
      });
    });

    it('shows "No description" placeholder for collections without description', async () => {
      mockCollectionsList.mockResolvedValue([MOCK_COLLECTION_2]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('No description')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe('empty state', () => {
    it('shows empty state when no collections are returned', async () => {
      // Arrange
      mockCollectionsList.mockResolvedValue([]);

      // Act
      renderPage();

      // Assert
      await waitFor(() => {
        expect(screen.getByText('No collections yet.')).toBeInTheDocument();
        expect(screen.getByText(/Create one to organise your files/)).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Create collection
  // -------------------------------------------------------------------------

  describe('create collection', () => {
    it('opens create modal when "New Collection" button is clicked', async () => {
      // Arrange
      mockCollectionsList.mockResolvedValue([]);

      // Act
      renderPage();
      await waitFor(() => screen.getByText(/No collections yet/));

      const btn = screen.getByRole('button', { name: /new collection/i });
      fireEvent.click(btn);

      // Assert: modal appears
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/e\.g\. Research Papers/i)).toBeInTheDocument();
    });

    it('calls collectionsApi.create and adds the new collection to the list', async () => {
      // Arrange
      mockCollectionsList.mockResolvedValue([]);
      const newCollection: KmsCollection = {
        id: 'col-new',
        name: 'My New Collection',
        description: 'Some description',
        isDefault: false,
        fileCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockCollectionsCreate.mockResolvedValue(newCollection);

      // Act
      renderPage();
      await waitFor(() => screen.getByText(/No collections yet/));

      fireEvent.click(screen.getByRole('button', { name: /new collection/i }));

      const nameInput = screen.getByPlaceholderText(/e\.g\. Research Papers/i);
      fireEvent.change(nameInput, { target: { value: 'My New Collection' } });

      const saveBtn = screen.getByRole('button', { name: /^save$/i });
      fireEvent.click(saveBtn);

      // Assert
      await waitFor(() => {
        expect(mockCollectionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'My New Collection' }),
        );
      });

      await waitFor(() => {
        expect(screen.getByText('My New Collection')).toBeInTheDocument();
      });
    });

    it('does not call create when name is empty', async () => {
      mockCollectionsList.mockResolvedValue([]);

      renderPage();
      await waitFor(() => screen.getByText(/No collections yet/));

      fireEvent.click(screen.getByRole('button', { name: /new collection/i }));

      // Save button should be disabled when name is empty
      const saveBtn = screen.getByRole('button', { name: /^save$/i });
      expect(saveBtn).toBeDisabled();
      expect(mockCollectionsCreate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Delete collection
  // -------------------------------------------------------------------------

  describe('delete collection', () => {
    it('removes a collection from the list after delete confirmation', async () => {
      // Arrange
      mockCollectionsList.mockResolvedValue([MOCK_COLLECTION_1, MOCK_COLLECTION_2]);
      mockCollectionsDelete.mockResolvedValue(undefined);

      // Act
      renderPage();
      await waitFor(() => screen.getByText('Research Papers'));

      // Click the delete button on the first card
      const deleteBtn = screen.getAllByRole('button', { name: /delete collection/i })[0];
      fireEvent.click(deleteBtn);

      // Confirm delete
      const confirmBtn = screen.getByRole('button', { name: /confirm delete/i });
      fireEvent.click(confirmBtn);

      // Assert
      await waitFor(() => {
        expect(mockCollectionsDelete).toHaveBeenCalledWith('col-001');
      });

      await waitFor(() => {
        expect(screen.queryByText('Research Papers')).not.toBeInTheDocument();
      });
    });

    it('does not show delete button on default collection', async () => {
      // Arrange
      mockCollectionsList.mockResolvedValue([MOCK_COLLECTION_DEFAULT]);

      // Act
      renderPage();
      await waitFor(() => screen.getByText('My Library'));

      // Assert: no delete or edit buttons for default collection
      expect(screen.queryByRole('button', { name: /delete collection/i })).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  describe('error state', () => {
    it('shows error banner when collections fail to load', async () => {
      // Arrange
      mockCollectionsList.mockRejectedValue(new Error('Network error'));

      // Act
      renderPage();

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/Failed to load collections/)).toBeInTheDocument();
      });
    });
  });
});
