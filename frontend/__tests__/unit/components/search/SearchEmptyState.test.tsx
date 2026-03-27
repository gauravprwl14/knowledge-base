/**
 * Unit tests for SearchEmptyState component.
 *
 * PRD: PRD-M05-search.md — FR-01 through FR-04 (result display)
 * Gap: No test existed for this component.  Key missing coverage:
 * - State A: query too short (< 2 chars) → prompt to start typing
 * - State B: query >= 2 chars, resultCount === 0 → no-results state
 * - State C: isError === true → error state (takes priority)
 * - Returns null when resultCount > 0 (results exist)
 */
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import {
  SearchEmptyState,
  type SearchEmptyStateProps,
} from '@/components/features/search/SearchEmptyState'

// ---------------------------------------------------------------------------
// Stub lucide-react icons so tests don't need a DOM rendering environment
// ---------------------------------------------------------------------------
jest.mock('lucide-react', () => ({
  Search: () => <span data-testid="icon-search" />,
  SearchX: () => <span data-testid="icon-search-x" />,
  AlertTriangle: () => <span data-testid="icon-alert-triangle" />,
}))

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderState(props: Partial<SearchEmptyStateProps> = {}) {
  const defaults: SearchEmptyStateProps = {
    query: '',
    resultCount: 0,
    isError: false,
    ...props,
  }
  return render(<SearchEmptyState {...defaults} />)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SearchEmptyState', () => {
  describe('State A — query too short (< 2 chars)', () => {
    it('renders the "start typing" prompt for an empty query', () => {
      renderState({ query: '' })
      expect(screen.getByText(/search your knowledge base/i)).toBeInTheDocument()
    })

    it('renders the "start typing" prompt for a single-char query', () => {
      renderState({ query: 'k' })
      expect(screen.getByText(/search your knowledge base/i)).toBeInTheDocument()
    })

    it('renders the Search icon for State A', () => {
      renderState({ query: '' })
      expect(screen.getByTestId('icon-search')).toBeInTheDocument()
    })

    it('does NOT render the SearchX icon for State A', () => {
      renderState({ query: '' })
      expect(screen.queryByTestId('icon-search-x')).not.toBeInTheDocument()
    })

    it('does NOT render the AlertTriangle icon for State A', () => {
      renderState({ query: '' })
      expect(screen.queryByTestId('icon-alert-triangle')).not.toBeInTheDocument()
    })

    it('renders the "at least 2 characters" hint', () => {
      renderState({ query: '' })
      expect(screen.getByText(/at least 2 characters/i)).toBeInTheDocument()
    })
  })

  describe('State B — query >= 2 chars, no results', () => {
    it('renders the "no results" heading with the query embedded', () => {
      renderState({ query: 'kubernetes', resultCount: 0 })
      expect(screen.getByText(/no results for/i)).toBeInTheDocument()
      expect(screen.getByText(/kubernetes/i)).toBeInTheDocument()
    })

    it('renders the SearchX icon for State B', () => {
      renderState({ query: 'kubernetes', resultCount: 0 })
      expect(screen.getByTestId('icon-search-x')).toBeInTheDocument()
    })

    it('does NOT render the Search icon for State B', () => {
      renderState({ query: 'kubernetes', resultCount: 0 })
      expect(screen.queryByTestId('icon-search')).not.toBeInTheDocument()
    })

    it('renders actionable suggestions to the user', () => {
      renderState({ query: 'my query', resultCount: 0 })
      expect(screen.getByText(/shorter or broader/i)).toBeInTheDocument()
    })

    it('suggests switching to Semantic mode', () => {
      renderState({ query: 'my query', resultCount: 0 })
      expect(screen.getByText(/semantic/i)).toBeInTheDocument()
    })

    it('renders for a 2-char query (boundary: exactly 2 chars is valid)', () => {
      renderState({ query: 'ab', resultCount: 0 })
      expect(screen.getByText(/no results for/i)).toBeInTheDocument()
    })

    it('renders for a whitespace-trimmed single char query as State A not State B', () => {
      // "  k  ".trim() == "k" which is length 1, so State A applies
      renderState({ query: '  k  ', resultCount: 0 })
      expect(screen.getByText(/search your knowledge base/i)).toBeInTheDocument()
    })
  })

  describe('State C — error', () => {
    it('renders the "search unavailable" heading when isError is true', () => {
      renderState({ query: 'my query', resultCount: 0, isError: true })
      expect(screen.getByText(/search unavailable/i)).toBeInTheDocument()
    })

    it('renders the AlertTriangle icon for State C', () => {
      renderState({ query: 'my query', resultCount: 0, isError: true })
      expect(screen.getByTestId('icon-alert-triangle')).toBeInTheDocument()
    })

    it('does NOT render the SearchX icon for State C', () => {
      renderState({ query: 'my query', resultCount: 0, isError: true })
      expect(screen.queryByTestId('icon-search-x')).not.toBeInTheDocument()
    })

    it('error state takes priority even when resultCount > 0', () => {
      // This is an edge case: error can co-exist with stale results
      renderState({ query: 'my query', resultCount: 5, isError: true })
      expect(screen.getByText(/search unavailable/i)).toBeInTheDocument()
    })

    it('error state takes priority over State A (short query)', () => {
      renderState({ query: '', resultCount: 0, isError: true })
      expect(screen.getByText(/search unavailable/i)).toBeInTheDocument()
    })

    it('renders the retry suggestion text', () => {
      renderState({ query: 'q', resultCount: 0, isError: true })
      expect(screen.getByText(/check your connection/i)).toBeInTheDocument()
    })
  })

  describe('null — results exist, no error', () => {
    it('returns null when resultCount > 0 and no error', () => {
      const { container } = renderState({ query: 'kubernetes', resultCount: 3, isError: false })
      expect(container.firstChild).toBeNull()
    })

    it('returns null for resultCount=1', () => {
      const { container } = renderState({ query: 'test', resultCount: 1 })
      expect(container.firstChild).toBeNull()
    })
  })
})
