/**
 * Text — paragraph and inline text primitive
 *
 * Renders a `<p>` by default; set `as="span"` for inline use.
 * Supports size, weight, colour, and muted variants.
 *
 * @example
 * <Text size="sm" color="muted">Last updated 2 hours ago</Text>
 * <Text as="span" weight="semibold">Important</Text>
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TextAs = 'p' | 'span' | 'div' | 'small' | 'strong' | 'em';
export type TextSize = 'xs' | 'sm' | 'base' | 'lg';
export type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold';
export type TextColor =
  | 'default'
  | 'muted'
  | 'subtle'
  | 'primary'
  | 'inverse'
  | 'error'
  | 'success';

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  /** HTML element rendered (default: `p`) */
  as?: TextAs;
  /** Font size */
  size?: TextSize;
  /** Font weight */
  weight?: TextWeight;
  /** Text colour */
  color?: TextColor;
  /** Truncate with ellipsis (requires a max-width on the container) */
  truncate?: boolean;
}

// ---------------------------------------------------------------------------
// Class maps
// ---------------------------------------------------------------------------

const sizeClasses: Record<TextSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
};

const weightClasses: Record<TextWeight, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

const colorClasses: Record<TextColor, string> = {
  default: 'text-neutral-900',
  muted: 'text-neutral-500',
  subtle: 'text-neutral-400',
  primary: 'text-indigo-600',
  inverse: 'text-white',
  error: 'text-red-600',
  success: 'text-green-600',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Body text primitive. Use for paragraphs, captions, and inline copy.
 */
export const Text = React.forwardRef<HTMLElement, TextProps>(
  (
    {
      as: Tag = 'p',
      size = 'base',
      weight = 'normal',
      color = 'default',
      truncate = false,
      className = '',
      children,
      ...rest
    },
    ref
  ) => {
    return (
      // @ts-expect-error — polymorphic ref typing; safe at runtime
      <Tag
        ref={ref}
        className={[
          'leading-normal',
          sizeClasses[size],
          weightClasses[weight],
          colorClasses[color],
          truncate ? 'truncate' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {children}
      </Tag>
    );
  }
);

Text.displayName = 'Text';
