import * as React from 'react';
import { render } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('renders with correct aria attributes', () => {
    const { container } = render(<ProgressBar value={40} />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps value between 0 and 100', () => {
    const { container } = render(<ProgressBar value={150} />);
    const fill = container.querySelector('[data-fill]');
    expect(fill).toHaveStyle({ width: '100%' });
  });

  it('applies blue color by default', () => {
    const { container } = render(<ProgressBar value={50} />);
    expect(container.querySelector('[data-fill]')).toHaveClass('bg-blue-500');
  });

  it('applies green color when specified', () => {
    const { container } = render(<ProgressBar value={50} color="green" />);
    expect(container.querySelector('[data-fill]')).toHaveClass('bg-emerald-500');
  });
});
