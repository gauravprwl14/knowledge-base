import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * Maps numeric gap tokens to Tailwind gap utility classes.
 * Defined statically so Tailwind's JIT scanner can detect the class names.
 */
const gapMap: Record<number, string> = {
  0: 'gap-0', 1: 'gap-1', 2: 'gap-2', 3: 'gap-3',
  4: 'gap-4', 5: 'gap-5', 6: 'gap-6', 8: 'gap-8',
  10: 'gap-10', 12: 'gap-12',
};

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Flex direction — defaults to 'col' (vertical stack). */
  direction?: 'row' | 'col' | 'row-reverse' | 'col-reverse';
  /** Spacing between children using Tailwind gap tokens. */
  gap?: keyof typeof gapMap;
  /** Cross-axis alignment (align-items). */
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  /** Main-axis justification (justify-content). */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  /** Whether to allow children to wrap onto multiple lines. */
  wrap?: boolean;
}

/**
 * Stack — flex layout primitive for arranging children in a row or column.
 *
 * Renders a `<div>` with Tailwind flex utilities composed from props.
 * All native `HTMLDivElement` attributes are forwarded.
 *
 * @example
 * <Stack direction="row" gap={4} align="center">
 *   <Icon icon={FileIcon} />
 *   <Text>filename.pdf</Text>
 * </Stack>
 */
export const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  ({ direction = 'col', gap = 0, align, justify, wrap, className, ...props }, ref) => {
    // Map align prop to Tailwind items-* class
    const alignMap: Record<string, string> = {
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
      stretch: 'items-stretch',
      baseline: 'items-baseline',
    };

    // Map justify prop to Tailwind justify-* class
    const justifyMap: Record<string, string> = {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
      between: 'justify-between',
      around: 'justify-around',
      evenly: 'justify-evenly',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'flex',
          // flex-col | flex-row | flex-row-reverse | flex-col-reverse
          `flex-${direction}`,
          // gap-0 through gap-12 from static map
          gapMap[gap],
          // Conditional cross-axis alignment
          align && alignMap[align],
          // Conditional main-axis justification
          justify && justifyMap[justify],
          // Optional wrapping
          wrap && 'flex-wrap',
          // Consumer overrides
          className,
        )}
        {...props}
      />
    );
  }
);

Stack.displayName = 'Stack';
