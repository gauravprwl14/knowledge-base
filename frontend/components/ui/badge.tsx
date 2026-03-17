import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]',
        active: 'border-transparent bg-[var(--color-status-success-bg)] text-[var(--color-status-success)]',
        inactive: 'border-transparent bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]',
        pending: 'border-transparent bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)]',
        error: 'border-transparent bg-[var(--color-status-error-bg)] text-[var(--color-status-error)]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
