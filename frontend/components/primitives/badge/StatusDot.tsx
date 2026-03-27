/**
 * StatusDot — small coloured dot for inline status indicators
 *
 * Pair with a `<Text>` or `<Badge>` for accessible labelling.
 * The dot itself is decorative (aria-hidden); accessibility is via siblings.
 *
 * @example
 * <Stack direction="row" gap={2} align="center">
 *   <StatusDot status="active" />
 *   <Text size="sm">Connected</Text>
 * </Stack>
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StatusDotStatus = 'active' | 'inactive' | 'pending' | 'error';
export type StatusDotSize = 'sm' | 'md' | 'lg';

export interface StatusDotProps {
  /** Status determines the dot colour */
  status: StatusDotStatus;
  /** Physical size of the dot */
  size?: StatusDotSize;
  /** Additional className */
  className?: string;
}

// ---------------------------------------------------------------------------
// Variant + size maps
// ---------------------------------------------------------------------------

const statusDotClasses: Record<StatusDotStatus, string> = {
  active: 'bg-[var(--color-status-success)]',
  inactive: 'bg-[var(--color-text-muted)]',
  pending: 'bg-[var(--color-status-warning)]',
  error: 'bg-[var(--color-status-error)]',
};

const dotSizeClasses: Record<StatusDotSize, string> = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-3 h-3',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Coloured dot used for inline status indication. Always pair with text label.
 */
export function StatusDot({
  status,
  size = 'md',
  className = '',
}: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={[
        'inline-block rounded-full shrink-0',
        statusDotClasses[status],
        dotSizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}

StatusDot.displayName = 'StatusDot';
