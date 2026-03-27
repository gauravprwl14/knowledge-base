import * as React from 'react';
import { cn } from '../lib/cn';

export interface SpinnerProps {
  /** Visual size of the spinner — controls diameter and border width. */
  size?: 'sm' | 'md' | 'lg';
  /** Additional Tailwind classes to apply to the spinner element. */
  className?: string;
}

/**
 * Maps size tokens to Tailwind dimension + border-width classes.
 * Defined as const to enable exhaustive-check in TypeScript.
 */
const sizeMap = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]',
} as const;

/**
 * Spinner — circular loading indicator.
 *
 * Uses a CSS `animate-spin` border technique: the base border is muted,
 * and only the top border is highlighted to create the spinning arc effect.
 * Includes `role="status"` and `aria-label` for accessibility.
 *
 * @example
 * <Spinner size="md" />
 */
export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className }) => {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        // Circular shape with spin animation
        'animate-spin rounded-full',
        // Muted base border + highlighted top border creates the arc
        'border-slate-700 border-t-blue-400',
        sizeMap[size],
        className,
      )}
    />
  );
};

Spinner.displayName = 'Spinner';
