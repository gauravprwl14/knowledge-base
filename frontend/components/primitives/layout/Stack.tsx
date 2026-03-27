/**
 * Stack — flex layout primitive
 *
 * Creates a flex container with consistent gap spacing from the design system.
 * Defaults to column direction. Set `direction="row"` for horizontal stacks.
 *
 * @example
 * <Stack gap={4}>
 *   <FormField ... />
 *   <FormField ... />
 *   <Button>Submit</Button>
 * </Stack>
 *
 * <Stack direction="row" gap={2} align="center">
 *   <Spinner size="sm" />
 *   <Text>Loading...</Text>
 * </Stack>
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StackDirection = 'row' | 'column';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type StackJustify =
  | 'start'
  | 'center'
  | 'end'
  | 'between'
  | 'around'
  | 'evenly';

/** Gap values mapped to Tailwind spacing scale */
export type StackGap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16;

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Flex direction */
  direction?: StackDirection;
  /** Gap between children — Tailwind spacing unit */
  gap?: StackGap;
  /** align-items */
  align?: StackAlign;
  /** justify-content */
  justify?: StackJustify;
  /** Wrap children when they overflow */
  wrap?: boolean;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Class maps
// ---------------------------------------------------------------------------

const directionClasses: Record<StackDirection, string> = {
  row: 'flex-row',
  column: 'flex-col',
};

const alignClasses: Record<StackAlign, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

const justifyClasses: Record<StackJustify, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
};

const gapClasses: Record<StackGap, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
  12: 'gap-12',
  16: 'gap-16',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Flex-based layout primitive for stacking children vertically or horizontally.
 */
export const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  (
    {
      direction = 'column',
      gap = 4,
      align = 'stretch',
      justify = 'start',
      wrap = false,
      className = '',
      children,
      ...rest
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={[
          'flex',
          directionClasses[direction],
          gapClasses[gap],
          alignClasses[align],
          justifyClasses[justify],
          wrap ? 'flex-wrap' : 'flex-nowrap',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

Stack.displayName = 'Stack';
