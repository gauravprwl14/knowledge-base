import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4',
  {
    variants: {
      variant: {
        default: 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)]',
        info: 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)] [&>svg]:text-[var(--color-accent)]',
        success: 'border-[var(--color-status-success)] bg-[var(--color-status-success-bg)] text-[var(--color-status-success)] [&>svg]:text-[var(--color-status-success)]',
        warning: 'border-[var(--color-status-warning)] bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)] [&>svg]:text-[var(--color-status-warning)]',
        destructive: 'border-[var(--color-status-error)] bg-[var(--color-status-error-bg)] text-[var(--color-status-error)] [&>svg]:text-[var(--color-status-error)]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  )
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />
  )
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
  )
);
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
