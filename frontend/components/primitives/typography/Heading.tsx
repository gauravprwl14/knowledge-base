/**
 * Heading — h1–h6 with design system scale
 *
 * The `as` prop controls the rendered HTML element; `size` controls visual
 * scale independently (allowing semantic/visual decoupling).
 *
 * @example
 * <Heading as="h1" size="2xl" weight="bold">
 *   Welcome back
 * </Heading>
 *
 * <Heading as="h3" size="base">
 *   Recent files
 * </Heading>
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
export type HeadingSize = 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
export type HeadingWeight = 'medium' | 'semibold' | 'bold';
export type HeadingColor = 'default' | 'muted' | 'primary' | 'inverse';

export interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement> {
  /** HTML element rendered */
  as?: HeadingLevel;
  /** Visual size — defaults to level-appropriate size */
  size?: HeadingSize;
  /** Font weight */
  weight?: HeadingWeight;
  /** Text colour */
  color?: HeadingColor;
}

// ---------------------------------------------------------------------------
// Class maps
// ---------------------------------------------------------------------------

const sizeClasses: Record<HeadingSize, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
};

const weightClasses: Record<HeadingWeight, string> = {
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

const colorClasses: Record<HeadingColor, string> = {
  default: 'text-neutral-900',
  muted: 'text-neutral-500',
  primary: 'text-indigo-600',
  inverse: 'text-white',
};

/** Default size for each heading level */
const defaultSizeForLevel: Record<HeadingLevel, HeadingSize> = {
  h1: '4xl',
  h2: '3xl',
  h3: '2xl',
  h4: 'xl',
  h5: 'lg',
  h6: 'base',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Heading primitive. Semantic HTML element is set via `as`; visual scale
 * via `size`. The two are independent.
 */
export const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(
  (
    {
      as: Tag = 'h2',
      size,
      weight = 'semibold',
      color = 'default',
      className = '',
      children,
      ...rest
    },
    ref
  ) => {
    const resolvedSize = size ?? defaultSizeForLevel[Tag];

    return (
      <Tag
        ref={ref}
        className={[
          'leading-tight tracking-tight',
          sizeClasses[resolvedSize],
          weightClasses[weight],
          colorClasses[color],
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

Heading.displayName = 'Heading';
