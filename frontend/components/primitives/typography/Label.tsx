/**
 * Label — form label primitive
 *
 * Thin wrapper around `<label>` with optional required asterisk.
 * Associates with its input via `htmlFor`.
 *
 * @example
 * <Label htmlFor="email" required>
 *   Email address
 * </Label>
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** When true, renders a red asterisk after the label text */
  required?: boolean;
  /** Visual size */
  size?: 'sm' | 'base';
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Form label primitive. Renders a required indicator when `required` is set.
 */
export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ required = false, size = 'sm', className = '', children, ...rest }, ref) => {
    const sizeCls = size === 'sm' ? 'text-sm' : 'text-base';

    return (
      <label
        ref={ref}
        className={[
          sizeCls,
          'font-medium text-neutral-700 leading-none block',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {children}
        {required && (
          <span
            aria-hidden="true"
            className="ml-0.5 text-red-500"
            title="Required"
          >
            *
          </span>
        )}
      </label>
    );
  }
);

Label.displayName = 'Label';
