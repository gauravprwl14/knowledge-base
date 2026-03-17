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
// Variant + size maps
// ---------------------------------------------------------------------------

const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] focus-visible:ring-[var(--color-accent)]',
  secondary:
    'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)] focus-visible:ring-[var(--color-accent)]',
  ghost:
    'bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] focus-visible:ring-[var(--color-accent)]',
  danger:
    'bg-[var(--color-status-error)] text-white hover:opacity-90 focus-visible:ring-[var(--color-status-error)]',
  outline:
    'bg-transparent border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] focus-visible:ring-[var(--color-accent)]',
};

const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

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
