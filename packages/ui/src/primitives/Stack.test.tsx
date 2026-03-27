import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { Stack } from './Stack';

describe('Stack', () => {
  it('renders children', () => {
    render(<Stack><span>A</span><span>B</span></Stack>);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('applies flex-col direction by default', () => {
    const { container } = render(<Stack><span>A</span></Stack>);
    expect(container.firstChild).toHaveClass('flex-col');
  });

  it('applies flex-row when direction is row', () => {
    const { container } = render(<Stack direction="row"><span>A</span></Stack>);
    expect(container.firstChild).toHaveClass('flex-row');
  });

  it('applies gap token class', () => {
    const { container } = render(<Stack gap={4}><span>A</span></Stack>);
    expect(container.firstChild).toHaveClass('gap-4');
  });
});
