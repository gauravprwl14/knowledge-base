import * as React from 'react';
import { render } from '@testing-library/react';
import { FileIcon } from 'lucide-react';
import { Icon } from './Icon';

describe('Icon', () => {
  it('renders a lucide icon without crashing', () => {
    const { container } = render(<Icon icon={FileIcon} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('applies sm size class', () => {
    const { container } = render(<Icon icon={FileIcon} size="sm" />);
    expect(container.querySelector('svg')).toHaveClass('h-4');
  });

  it('applies lg size class', () => {
    const { container } = render(<Icon icon={FileIcon} size="lg" />);
    expect(container.querySelector('svg')).toHaveClass('h-6');
  });

  it('applies aria-label when provided', () => {
    const { container } = render(<Icon icon={FileIcon} aria-label="File icon" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'File icon');
  });
});
