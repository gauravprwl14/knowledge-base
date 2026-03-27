import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * Maps color tokens to Tailwind background-color classes.
 * Defined statically so Tailwind JIT can detect all class names at build time.
 */
const colorMap = {
  blue:  'bg-blue-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red:   'bg-red-500',
} as const;

/** Union of accepted color token names. */
export type ProgressBarColor = keyof typeof colorMap;

export interface ProgressBarProps {
  /**
   * Progress value from 0–100.
   * Values outside this range are clamped automatically.
   */
  value: number;
  /** Fill color of the progress bar — defaults to 'blue'. */
  color?: ProgressBarColor;
  /** Additional Tailwind classes for the outer track element. */
  className?: string;
}

/**
 * ProgressBar — horizontal progress indicator with aria attributes.
 *
 * Renders an outer track div with `role="progressbar"` and the correct
 * ARIA attributes, plus an inner fill div whose width reflects progress.
 * Values outside 0–100 are clamped before rendering.
 *
 * @example
 * <ProgressBar value={embeddingProgress} color="blue" />
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  color = 'blue',
  className,
}) => {
  // Clamp to valid 0–100 range to prevent broken layout or invalid ARIA values
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-slate-800', className)}
    >
      {/* data-fill attribute allows test selectors and consumer CSS targeting */}
      <div
        data-fill
        className={cn(
          'h-full rounded-full transition-all duration-300',
          colorMap[color],
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
};

ProgressBar.displayName = 'ProgressBar';
