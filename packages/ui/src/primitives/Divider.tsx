import * as React from 'react';
import { cn } from '../lib/cn';

export interface DividerProps extends React.HTMLAttributes<HTMLHRElement> {
  /** Axis of the separator line — defaults to 'horizontal'. */
  orientation?: 'horizontal' | 'vertical';
}

/**
 * Divider — thin separator line between sections.
 *
 * For horizontal orientation, renders a semantic `<hr>` element.
 * For vertical orientation, renders a `<div>` (since `<hr>` cannot be inline-flex),
 * with `aria-orientation="vertical"` for accessibility.
 *
 * @example
 * <Divider />
 * <Divider orientation="vertical" className="h-6" />
 */
export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  className,
  ...props
}) => {
  if (orientation === 'vertical') {
    // Vertical divider cannot use <hr> reliably in flex containers —
    // use a <div> with role="separator" and explicit aria-orientation instead.
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn('w-px bg-slate-700 self-stretch', className)}
        {...(props as React.HTMLAttributes<HTMLDivElement>)}
      />
    );
  }

  return (
    <hr
      role="separator"
      className={cn('border-0 border-t border-slate-700 w-full', className)}
      {...props}
    />
  );
};

Divider.displayName = 'Divider';
