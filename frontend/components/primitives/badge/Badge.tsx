import * as React from 'react';
import { badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'default' | 'active' | 'inactive' | 'pending' | 'error';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic colour variant */
  variant?: BadgeVariant;
  /** Size */
  size?: BadgeSize;
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
};

/**
 * Status badge primitive with semantic colour variants.
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', size = 'sm', className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant }), sizeClasses[size], className)}
      {...props}
    />
  )
);
Badge.displayName = 'Badge';
