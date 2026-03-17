/**
 * Badge — semantic status pill
 *
 * Semantic variants: default, active, inactive, pending, error.
 * Use for displaying status labels on records (API keys, jobs, etc.).
 *
 * @example
 * <Badge variant="active">Active</Badge>
 * <Badge variant="pending">Pending</Badge>
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BadgeVariant = 'default' | 'active' | 'inactive' | 'pending' | 'error';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic colour variant */
  variant?: BadgeVariant;
  /** Size */
  size?: BadgeSize;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Variant + size maps
// ---------------------------------------------------------------------------

const badgeVariantClasses: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]',
  active: 'bg-[var(--color-status-success-bg)] text-[var(--color-status-success)]',
  inactive: 'bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]',
  pending: 'bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)]',
  error: 'bg-[var(--color-status-error-bg)] text-[var(--color-status-error)]',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Status badge primitive with semantic colour variants.
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    { variant = 'default', size = 'sm', className = '', children, ...rest },
    ref
  ) => {
    return (
      <span
        ref={ref}
        className={[
          'inline-flex items-center font-medium rounded-full',
          badgeVariantClasses[variant],
          sizeClasses[size],
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
