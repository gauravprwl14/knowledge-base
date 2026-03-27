import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * Mapping of semantic color names to their Tailwind utility classes.
 * Each color defines background, text, and border using opacity modifiers
 * so the badge sits naturally on dark surfaces without blowing out contrast.
 */
const statusColors = {
  green:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  amber:  'bg-amber-500/15  text-amber-400  border-amber-500/30',
  red:    'bg-red-500/15    text-red-400    border-red-500/30',
  blue:   'bg-blue-500/15   text-blue-400   border-blue-500/30',
  gray:   'bg-slate-500/15  text-slate-400  border-slate-500/30',
  yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
} as const;

/** Union of supported badge color names. */
export type BadgeColor = keyof typeof statusColors;

/**
 * cva variant definitions for Badge.
 *
 * - `status` — coloured indicator badge; pair with a `color` prop.
 * - `tag`    — flat dark chip for metadata labels (e.g. file type, language).
 * - `count`  — minimal numeric counter (e.g. result count, unread items).
 */
const badgeVariants = cva(
  // Base: pill shape, small text, always inline
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border',
  {
    variants: {
      variant: {
        // Border is provided by statusColors when variant === 'status'
        status: 'border',
        tag:    'bg-slate-800 text-slate-300 border-slate-700',
        count:  'bg-slate-700 text-slate-400 border-transparent',
      },
    },
    defaultVariants: { variant: 'status' },
  }
);

/** Props accepted by the Badge component. */
export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /**
   * Semantic color applied when `variant="status"`.
   * Has no effect for `tag` or `count` variants.
   * @default 'gray'
   */
  color?: BadgeColor;
}

/**
 * Badge — compact inline label for status indicators, metadata tags, or counts.
 *
 * @example
 * <Badge variant="status" color="green">Indexed</Badge>
 * <Badge variant="tag">typescript</Badge>
 * <Badge variant="count">42</Badge>
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, color = 'gray', children, ...props }, ref) => {
    // Only apply the color lookup for the status variant — tag/count have
    // their own fixed palette baked into the cva definition above.
    const colorClass = variant === 'status' ? statusColors[color] : '';

    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant }), colorClass, className)}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
