/**
 * Unit tests for the SearchInput primitive component.
 *
 * SearchInput wraps Input with a left-side search icon and an optional
 * right-side clear button that appears when the input has a value.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SearchInput } from '@/components/primitives/input/SearchInput'

// Mock lucide-react icons so they render as identifiable elements without
// needing an SVG environment set up in jsdom.
jest.mock('lucide-react', () => ({
  Search: ({ 'aria-hidden': ariaHidden }: { 'aria-hidden'?: string }) => (
    <span data-testid="search-icon" aria-hidden={ariaHidden} />
  ),
  X: ({ 'aria-hidden': ariaHidden }: { 'aria-hidden'?: string }) => (
    <span data-testid="x-icon" aria-hidden={ariaHidden} />
  ),
}))

// Minimal mock of the Input primitive — renders a real <input> so we can
// test interactions, and spreads all props through.
// Use require('react') inside the factory to avoid the temporal dead zone issue
// that occurs when the jest.mock factory references the imported React variable
// before module initialisation.
jest.mock('@/components/primitives/input/Input', () => {
  const React = require('react')
  return {
    Input: React.forwardRef(
      (
        {
          prefix,
          suffix,
          error: _error,
          className: _cls,
          ...rest
        }: {
          prefix?: React.ReactNode
          suffix?: React.ReactNode
          error?: boolean
          className?: string
          [key: string]: unknown
        },
        ref: React.Ref<HTMLInputElement>
      ) => (
        <div>
          {prefix}
          <input ref={ref} data-testid="search-input-element" {...rest} />
          {suffix}
        </div>
      )
    ),
  }
})

describe('SearchInput', () => {
  it('renders the search icon', () => {
    render(<SearchInput value="" onChange={jest.fn()} />)
    expect(screen.getByTestId('search-icon')).toBeInTheDocument()
  })

  it('renders an input with role searchbox', () => {
    render(<SearchInput value="" onChange={jest.fn()} />)
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('does not render the clear button when value is empty', () => {
    render(<SearchInput value="" onChange={jest.fn()} />)
    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull()
  })

  it('renders the clear button when value is non-empty', () => {
    render(<SearchInput value="hello" onChange={jest.fn()} />)
    expect(screen.getByRole('button', { name: /clear search/i })).toBeInTheDocument()
  })

  it('calls onClear when the clear button is clicked', () => {
    const onClear = jest.fn()
    render(<SearchInput value="hello" onChange={jest.fn()} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: /clear search/i }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('calls onChange when the user types in the input', () => {
    const onChange = jest.fn()
    render(<SearchInput value="" onChange={onChange} />)
    fireEvent.change(screen.getByTestId('search-input-element'), {
      target: { value: 'query' },
    })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('forwards placeholder prop to the underlying input', () => {
    render(
      <SearchInput value="" onChange={jest.fn()} placeholder="Search files..." />
    )
    expect(screen.getByPlaceholderText('Search files...')).toBeInTheDocument()
  })

  it('forwards ref to the underlying input element', () => {
    const ref = { current: null as HTMLInputElement | null }
    render(<SearchInput ref={ref} value="" onChange={jest.fn()} />)
    expect(ref.current).not.toBeNull()
  })

  it('disables the clear button type to prevent form submission', () => {
    render(<SearchInput value="text" onChange={jest.fn()} onClear={jest.fn()} />)
    const clearBtn = screen.getByRole('button', { name: /clear search/i })
    expect(clearBtn).toHaveAttribute('type', 'button')
  })
})
