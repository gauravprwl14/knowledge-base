import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const handler = jest.fn();
    render(<Button onClick={handler}>Go</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is passed', async () => {
    const handler = jest.fn();
    render(<Button disabled onClick={handler}>Go</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(handler).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('applies solid variant styles by default', () => {
    render(<Button>Solid</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-blue-600');
  });

  it('applies ghost variant styles', () => {
    render(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-transparent');
  });

  it('applies destructive variant styles', () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-red-600');
  });

  it('renders as a custom element when asChild is used', () => {
    render(
      <Button asChild>
        <a href="/test">Link</a>
      </Button>
    );
    // Should render as <a>, not <button>
    expect(screen.getByRole('link', { name: 'Link' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('merges additional className', () => {
    render(<Button className="custom-class">Styled</Button>);
    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });
});
