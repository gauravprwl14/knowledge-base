/**
 * Unit tests for the FileCard feature component.
 *
 * FileCard is the primary data-display component in the Drive file browser.
 * It shows file metadata, a selection checkbox, status dot, tag chips, and
 * hover action buttons (preview, add-to-collection, delete).
 */
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FileCard } from '@/components/features/drive/FileCard'
import type { KmsFile } from '@/lib/api/files'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Stub lucide-react icons as identifiable spans
jest.mock('lucide-react', () => ({
  Eye: () => <span data-testid="icon-eye" />,
  FolderPlus: () => <span data-testid="icon-folder-plus" />,
  Trash2: () => <span data-testid="icon-trash" />,
}))

// Stub the FileTypeIcon — we test it separately; here we only care that it renders
jest.mock('@/components/features/drive/FileTypeIcon', () => ({
  FileTypeIcon: ({ mimeType }: { mimeType: string }) => (
    <span data-testid="file-type-icon" data-mime={mimeType} />
  ),
  getFileTypeInfo: (_mime: string) => ({ label: 'DOC', colorClass: 'text-blue-500' }),
}))

// Stub lib/utils: cn returns joined truthy strings; formatDistanceToNow returns a fixed string
jest.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) =>
    args
      .filter(Boolean)
      .map((a) => (typeof a === 'string' ? a : ''))
      .join(' ')
      .trim(),
  formatDistanceToNow: () => '2 days ago',
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseFile: KmsFile = {
  id: 'file-001',
  name: 'project-notes.md',
  path: 'vault/project-notes.md',
  mimeType: 'text/markdown',
  sizeBytes: 4096,
  status: 'INDEXED',
  sourceId: 'src-001',
  collectionId: null,
  tags: [],
  indexedAt: '2026-01-15T10:00:00Z',
  createdAt: '2026-01-14T08:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
}

const defaultProps = {
  file: baseFile,
  isSelected: false,
  anySelected: false,
  onSelect: jest.fn(),
  onDelete: jest.fn(),
  onAddToCollection: jest.fn(),
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderCard(overrides: Partial<typeof defaultProps> = {}) {
  return render(<FileCard {...defaultProps} {...overrides} />)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FileCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('basic rendering', () => {
    it('renders the file name', () => {
      renderCard()
      expect(screen.getByText('project-notes.md')).toBeInTheDocument()
    })

    it('renders the formatted file size', () => {
      renderCard()
      // 4096 bytes → 4.0 KB
      expect(screen.getByText('4.0 KB')).toBeInTheDocument()
    })

    it('renders the relative indexed time', () => {
      renderCard()
      expect(screen.getByText(/indexed 2 days ago/i)).toBeInTheDocument()
    })

    it('renders the FileTypeIcon with the correct mimeType', () => {
      renderCard()
      expect(screen.getByTestId('file-type-icon')).toHaveAttribute(
        'data-mime',
        'text/markdown'
      )
    })

    it('renders the MIME type label pill', () => {
      renderCard()
      expect(screen.getByText('DOC')).toBeInTheDocument()
    })

    it('renders with role="article" and aria-label equal to the file name', () => {
      renderCard()
      expect(
        screen.getByRole('article', { name: 'project-notes.md' })
      ).toBeInTheDocument()
    })
  })

  describe('selection behaviour', () => {
    it('sets aria-selected="false" when not selected', () => {
      renderCard()
      expect(screen.getByRole('article', { name: 'project-notes.md' })).toHaveAttribute(
        'aria-selected',
        'false'
      )
    })

    it('sets aria-selected="true" when isSelected is true', () => {
      renderCard({ isSelected: true })
      expect(screen.getByRole('article', { name: 'project-notes.md' })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    })

    it('calls onSelect with (fileId, true) when the card is clicked and not selected', () => {
      renderCard()
      fireEvent.click(screen.getByRole('article', { name: 'project-notes.md' }))
      expect(defaultProps.onSelect).toHaveBeenCalledWith('file-001', true)
    })

    it('calls onSelect with (fileId, false) when the card is clicked and already selected', () => {
      renderCard({ isSelected: true })
      fireEvent.click(screen.getByRole('article', { name: 'project-notes.md' }))
      expect(defaultProps.onSelect).toHaveBeenCalledWith('file-001', false)
    })

    it('renders the checkbox when anySelected is true', () => {
      renderCard({ anySelected: true })
      expect(
        screen.getByRole('checkbox', { name: /select project-notes.md/i })
      ).toBeInTheDocument()
    })

    it('the checkbox reflects the isSelected state', () => {
      renderCard({ anySelected: true, isSelected: true })
      expect(
        screen.getByRole('checkbox', { name: /select project-notes.md/i })
      ).toBeChecked()
    })
  })

  describe('tag chips', () => {
    it('renders no tag chips when file has no tags', () => {
      renderCard()
      expect(screen.queryByRole('generic', { name: /more/i })).toBeNull()
    })

    it('renders up to 3 tag chips', () => {
      const file: KmsFile = {
        ...baseFile,
        tags: [
          { id: 't1', name: 'alpha', color: '#6366f1' },
          { id: 't2', name: 'beta', color: '#8b5cf6' },
          { id: 't3', name: 'gamma', color: '#ec4899' },
        ],
      }
      renderCard({ file })
      expect(screen.getByText('alpha')).toBeInTheDocument()
      expect(screen.getByText('beta')).toBeInTheDocument()
      expect(screen.getByText('gamma')).toBeInTheDocument()
    })

    it('renders overflow chip when more than 3 tags exist', () => {
      const file: KmsFile = {
        ...baseFile,
        tags: [
          { id: 't1', name: 'alpha', color: '#6366f1' },
          { id: 't2', name: 'beta', color: '#8b5cf6' },
          { id: 't3', name: 'gamma', color: '#ec4899' },
          { id: 't4', name: 'delta', color: '#14b8a6' },
          { id: 't5', name: 'epsilon', color: '#f59e0b' },
        ],
      }
      renderCard({ file })
      // Only first 3 visible
      expect(screen.queryByText('delta')).toBeNull()
      expect(screen.queryByText('epsilon')).toBeNull()
      // Overflow chip: +2 more
      expect(screen.getByText('+2 more')).toBeInTheDocument()
    })
  })

  describe('action buttons', () => {
    it('calls onDelete with the file id when delete button is clicked', () => {
      renderCard()
      fireEvent.click(screen.getByTitle('Delete file'))
      expect(defaultProps.onDelete).toHaveBeenCalledWith('file-001')
    })

    it('calls onAddToCollection with the file id when add-to-collection button is clicked', () => {
      renderCard()
      fireEvent.click(screen.getByTitle('Add to collection'))
      expect(defaultProps.onAddToCollection).toHaveBeenCalledWith('file-001')
    })

    it('action button clicks do not bubble to the card onSelect handler', () => {
      renderCard()
      fireEvent.click(screen.getByTitle('Delete file'))
      // onSelect should NOT have been called
      expect(defaultProps.onSelect).not.toHaveBeenCalled()
    })
  })

  describe('status dot', () => {
    it.each([
      ['INDEXED', 'bg-emerald-400'],
      ['PENDING', 'bg-amber-400'],
      ['PROCESSING', 'bg-blue-400'],
      ['ERROR', 'bg-red-400'],
    ] as const)('renders correct dot color for status %s', (status, expectedClass) => {
      const file: KmsFile = { ...baseFile, status }
      renderCard({ file })
      const dot = screen.getByTitle(status)
      expect(dot.className).toContain(expectedClass)
    })
  })

  describe('file size formatting', () => {
    it('displays bytes for very small files', () => {
      renderCard({ file: { ...baseFile, sizeBytes: 512 } })
      expect(screen.getByText('512 B')).toBeInTheDocument()
    })

    it('displays MB for large files', () => {
      renderCard({ file: { ...baseFile, sizeBytes: 5 * 1024 * 1024 } })
      expect(screen.getByText('5.0 MB')).toBeInTheDocument()
    })
  })
})
