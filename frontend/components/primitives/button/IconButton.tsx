/**
 * IconButton — icon-only button primitive
 *
 * An accessible button that contains only an icon.
 * `aria-label` is required and enforced at the type level.
 *
 * @example
 * <IconButton aria-label="Close dialog" onClick={onClose}>
 *   <X className="w-4 h-4" />
 * </IconButton>
 */

import React from 'react';
import type { ButtonVariant, ButtonSize } from './Button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label — required for screen readers */
  'aria-label': string;
  /** Visual variant */
  variant?: ButtonVariant;
  /** Controls the icon container size */
  size?: ButtonSize;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Variant + size maps for icon-only buttons
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

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Square icon-only button. Requires `aria-label` for accessibility.
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      variant = 'ghost',
      size = 'md',
      className = '',
      disabled,
      children,
      ...rest
    },
    ref
  ) => {
    const variantCls = buttonVariantClasses[variant];
    const sizeCls = iconSizeClasses[size];

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={[
          'inline-flex items-center justify-center rounded-md',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'transition-colors duration-150',
          variantCls,
          sizeCls,
          disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer',
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

IconButton.displayName = 'IconButton';
