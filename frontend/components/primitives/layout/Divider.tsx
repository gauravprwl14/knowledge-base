/**
 * Divider — horizontal or vertical separator
 *
 * Renders an `<hr>` (horizontal) or a `<div>` (vertical).
 * Use the `label` prop to create a labelled section divider.
 *
 * @example
 * // Horizontal
 * <Divider />
 *
 * // Labelled
 * <Divider label="OR" />
 *
 * // Vertical (requires parent to have a defined height)
 * <Stack direction="row" className="h-8">
 *   <Text>Left</Text>
 *   <Divider orientation="vertical" />
 *   <Text>Right</Text>
 * </Stack>
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DividerOrientation = 'horizontal' | 'vertical';

export interface DividerProps {
  orientation?: DividerOrientation;
  /** Optional label centred on a horizontal divider */
  label?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Visual separator. Supports horizontal (with optional label) and vertical variants.
 */
export function Divider({
  orientation = 'horizontal',
  label,
  className = '',
}: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={[
          'inline-block self-stretch w-px bg-neutral-200',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      />
    );
  }

  if (label) {
    return (
      <div
        role="separator"
        aria-orientation="horizontal"
        className={['flex items-center gap-3', className].filter(Boolean).join(' ')}
      >
        <div className="flex-1 h-px bg-neutral-200" />
        <span className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
          {label}
        </span>
        <div className="flex-1 h-px bg-neutral-200" />
      </div>
    );
  }

  return (
    <hr
      role="separator"
      aria-orientation="horizontal"
      className={[
        'border-0 h-px bg-neutral-200',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}

Divider.displayName = 'Divider';
