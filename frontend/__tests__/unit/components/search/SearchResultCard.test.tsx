/**
 * Unit tests for SearchResultCard component.
 *
 * PRD: PRD-M05-search.md — FR-05, FR-06 (result shape, snippet display)
 * Gap: No tests existed for this component.  Key missing coverage:
 * - Renders filename, chunk index badge, content snippet
 * - Score bar width is proportional to score
 * - "Open source file" links to /files/{fileId}
 * - Highlighted terms wrapped in <mark> tags
 * - Null/edge-case inputs (empty content, score=0, score=1)
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SearchResultCard } from '@/components/features/search/SearchResultCard'
import type { SearchResult } from '@/lib/api/search'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('lucide-react', () => ({
  FileText: () => <span data-testid="icon-file-text" />,
  Image: () => <span data-testid="icon-image" />,
  Music: () => <span data-testid="icon-music" />,
  Video: () => <span data-testid="icon-video" />,
  Table: () => <span data-testid="icon-table" />,
  File: () => <span data-testid="icon-file" />,
  Copy: () => <span data-testid="icon-copy" />,
  ExternalLink: () => <span data-testid="icon-external-link" />,
  Check: () => <span data-testid="icon-check" />,
}))

// Stub navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: jest.fn().mockResolvedValue(undefined) },
  writable: true,
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseResult: SearchResult = {
  id: 'chunk-001',
  fileId: 'file-001',
  filename: 'project-notes.md',
  content: 'The RAG pipeline uses BGE-M3 embeddings for semantic search.',
  score: 0.75,
  chunkIndex: 2,
  metadata: {},
}

function renderCard(overrides: Partial<SearchResult> = {}, query = '') {
  return render(
    <SearchResultCard result={{ ...baseResult, ...overrides }} query={query} />,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SearchResultCard', () => {
  describe('basic rendering', () => {
    it('renders the filename', () => {
      renderCard()
      expect(screen.getByText('project-notes.md')).toBeInTheDocument()
    })

    it('renders the chunk index badge (1-based)', () => {
      renderCard()
      // chunkIndex=2 → "chunk 3"
      expect(screen.getByText(/chunk 3/i)).toBeInTheDocument()
    })

    it('renders chunk 1 for chunkIndex=0', () => {
      renderCard({ chunkIndex: 0 })
      expect(screen.getByText(/chunk 1/i)).toBeInTheDocument()
    })

    it('renders the content snippet', () => {
      renderCard()
      expect(screen.getByText(/RAG pipeline/i)).toBeInTheDocument()
    })

    it('renders with role="article"', () => {
      renderCard()
      expect(
        screen.getByRole('article', { name: /project-notes.md/i }),
      ).toBeInTheDocument()
    })

    it('aria-label includes the filename and chunk index', () => {
      renderCard()
      const article = screen.getByRole('article')
      expect(article).toHaveAttribute(
        'aria-label',
        expect.stringContaining('project-notes.md'),
      )
      expect(article).toHaveAttribute(
        'aria-label',
        expect.stringContaining('chunk 3'),
      )
    })
  })

  describe('score bar', () => {
    it('renders a score percentage label', () => {
      renderCard({ score: 0.75 })
      expect(screen.getByText(/75% relevance/i)).toBeInTheDocument()
    })

    it('renders 100% relevance when score is 1', () => {
      renderCard({ score: 1.0 })
      expect(screen.getByText(/100% relevance/i)).toBeInTheDocument()
    })

    it('renders 0% relevance when score is 0', () => {
      renderCard({ score: 0 })
      expect(screen.getByText(/0% relevance/i)).toBeInTheDocument()
    })

    it('rounds score to nearest integer percent', () => {
      renderCard({ score: 0.666 })
      expect(screen.getByText(/67% relevance/i)).toBeInTheDocument()
    })
  })

  describe('open source file link', () => {
    it('renders a link to /files/{fileId}', () => {
      renderCard()
      const link = screen.getByRole('link', { name: /open source file/i })
      expect(link).toHaveAttribute('href', '/files/file-001')
    })

    it('uses the correct fileId from the result', () => {
      renderCard({ fileId: 'file-xyz-999' })
      const link = screen.getByRole('link', { name: /open source file/i })
      expect(link).toHaveAttribute('href', '/files/file-xyz-999')
    })
  })

  describe('content highlighting', () => {
    it('wraps matching query terms in <mark> tags', () => {
      const { container } = renderCard({ content: 'The RAG pipeline uses BGE-M3' }, 'RAG pipeline')
      expect(container.querySelectorAll('mark').length).toBeGreaterThan(0)
    })

    it('does not add <mark> tags when query is empty', () => {
      const { container } = renderCard({ content: 'Some content here' }, '')
      expect(container.querySelectorAll('mark')).toHaveLength(0)
    })

    it('is case-insensitive for highlighted terms', () => {
      const { container } = renderCard({ content: 'The RAG pipeline is fast' }, 'rag')
      expect(container.querySelectorAll('mark').length).toBeGreaterThan(0)
    })
  })

  describe('copy action', () => {
    it('calls clipboard.writeText with result content on copy button click', async () => {
      renderCard()
      const copyBtn = screen.getByRole('button', { name: /copy chunk text/i })
      await act(async () => {
        fireEvent.click(copyBtn)
      })
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(baseResult.content)
    })

    it('shows the check icon after copying', async () => {
      renderCard()
      const copyBtn = screen.getByRole('button', { name: /copy chunk text/i })
      await act(async () => {
        fireEvent.click(copyBtn)
      })
      expect(screen.getByTestId('icon-check')).toBeInTheDocument()
    })
  })

  describe('file type icon', () => {
    it('renders the FileText icon for markdown files', () => {
      renderCard({ filename: 'notes.md' })
      expect(screen.getByTestId('icon-file-text')).toBeInTheDocument()
    })

    it('renders the Image icon for image files', () => {
      renderCard({ filename: 'screenshot.png' })
      expect(screen.getByTestId('icon-image')).toBeInTheDocument()
    })

    it('renders the Music icon for audio files', () => {
      renderCard({ filename: 'podcast.mp3' })
      expect(screen.getByTestId('icon-music')).toBeInTheDocument()
    })

    it('renders the File icon for unknown extensions', () => {
      renderCard({ filename: 'unknown.xyz' })
      expect(screen.getByTestId('icon-file')).toBeInTheDocument()
    })

    it('renders the Table icon for spreadsheet files', () => {
      renderCard({ filename: 'data.csv' })
      expect(screen.getByTestId('icon-table')).toBeInTheDocument()
    })
  })

  describe('empty / edge-case content', () => {
    it('renders without crashing when content is an empty string', () => {
      expect(() => renderCard({ content: '' })).not.toThrow()
    })

    it('renders without crashing when chunkIndex is 0', () => {
      expect(() => renderCard({ chunkIndex: 0 })).not.toThrow()
    })

    it('renders without crashing when score is 0', () => {
      expect(() => renderCard({ score: 0 })).not.toThrow()
    })
  })
})
