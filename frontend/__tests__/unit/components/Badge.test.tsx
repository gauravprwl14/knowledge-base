/**
 * Unit tests for the Badge primitive component.
 */
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Badge } from '@/components/primitives/badge/Badge'

// The badgeVariants helper from shadcn/ui badge uses cva; mock it to return
// a predictable class string so tests are not coupled to Tailwind internals.
jest.mock('@/components/ui/badge', () => ({
  badgeVariants: ({ variant }: { variant?: string }) =>
    `badge badge-${variant ?? 'default'}`,
}))

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Active</Badge>)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders as a <span> element', () => {
    render(<Badge>Label</Badge>)
    expect(screen.getByText('Label').tagName).toBe('SPAN')
  })

  it('applies the default variant class when no variant is provided', () => {
    render(<Badge>Default</Badge>)
    expect(screen.getByText('Default').className).toContain('badge-default')
  })

  it.each(['active', 'inactive', 'pending', 'error'] as const)(
    'applies the %s variant class',
    (variant) => {
      render(<Badge variant={variant}>{variant}</Badge>)
      expect(screen.getByText(variant).className).toContain(`badge-${variant}`)
    }
  )

  it('applies the sm size class by default', () => {
    render(<Badge>Small</Badge>)
    expect(screen.getByText('Small').className).toContain('text-xs')
  })

  it('applies the md size class when size="md"', () => {
    render(<Badge size="md">Medium</Badge>)
    expect(screen.getByText('Medium').className).toContain('text-sm')
  })

  it('merges additional className prop', () => {
    render(<Badge className="custom-class">Extra</Badge>)
    expect(screen.getByText('Extra').className).toContain('custom-class')
  })

  it('forwards extra HTML attributes to the span', () => {
    render(<Badge data-testid="my-badge">Test</Badge>)
    expect(screen.getByTestId('my-badge')).toBeInTheDocument()
  })

  it('forwards ref to the underlying span element', () => {
    const ref = { current: null as HTMLSpanElement | null }
    render(<Badge ref={ref}>Ref</Badge>)
    expect(ref.current).not.toBeNull()
    expect(ref.current?.tagName).toBe('SPAN')
  })
})
