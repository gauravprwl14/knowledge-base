import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>INDEXED</Badge>);
    expect(screen.getByText('INDEXED')).toBeInTheDocument();
  });

  it('applies status-success color for green variant', () => {
    render(<Badge variant="status" color="green">Active</Badge>);
    expect(screen.getByText('Active')).toHaveClass('text-emerald-400');
  });

  it('applies status-error color for red variant', () => {
    render(<Badge variant="status" color="red">Error</Badge>);
    expect(screen.getByText('Error')).toHaveClass('text-red-400');
  });

  it('applies tag variant styles', () => {
    render(<Badge variant="tag">typescript</Badge>);
    expect(screen.getByText('typescript')).toHaveClass('bg-slate-800');
  });

  it('merges additional className', () => {
    render(<Badge className="mt-2">Label</Badge>);
    expect(screen.getByText('Label')).toHaveClass('mt-2');
  });
});
