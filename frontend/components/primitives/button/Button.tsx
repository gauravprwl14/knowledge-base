/**
 * Button — primitive button component
 *
 * Thin wrapper around the native `<button>` element with design-system
 * variants, sizes, and disabled state. No shadcn dependency.
 *
 * @example
 * <Button variant="primary" size="md" onClick={handleClick}>
 *   Save
 * </Button>
 */

import React from 'react';
import { buttonVariantClasses, buttonSizeClasses } from '../../../lib/design-system/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant — controls colour scheme */
  variant?: ButtonVariant;
  /** Size — controls height, padding, and font-size */
  size?: ButtonSize;
  /** Full-width block button */
  fullWidth?: boolean;
  /** Content rendered inside the button */
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Base button primitive. All other button variants (LoadingButton, IconButton)
 * are built on top of this component.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      className = '',
      disabled,
      children,
      ...rest
    },
    ref
  ) => {
    const variantCls = buttonVariantClasses[variant];
    const sizeCls = buttonSizeClasses[size];

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={[
          // Base styles
          'inline-flex items-center justify-center font-medium rounded-md',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'transition-colors duration-150',
          // Variant + size
          variantCls,
          sizeCls,
          // State
          disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer',
          fullWidth ? 'w-full' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
