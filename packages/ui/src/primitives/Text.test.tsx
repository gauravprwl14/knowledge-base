import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { Text } from './Text';

describe('Text', () => {
  it('renders as <p> by default', () => {
    render(<Text>Hello</Text>);
    expect(screen.getByText('Hello').tagName).toBe('P');
  });

  it('renders as specified element via as prop', () => {
    render(<Text as="h2">Title</Text>);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('applies heading variant styles', () => {
    render(<Text variant="heading">Title</Text>);
    expect(screen.getByText('Title')).toHaveClass('font-semibold');
  });

  it('applies muted variant styles', () => {
    render(<Text variant="muted">Hint</Text>);
    expect(screen.getByText('Hint')).toHaveClass('text-slate-400');
  });

  it('merges additional className', () => {
    render(<Text className="mt-4">Spaced</Text>);
    expect(screen.getByText('Spaced')).toHaveClass('mt-4');
  });
});
