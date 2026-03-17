import * as React from 'react';
import {
  Card as ShadcnCard,
  CardHeader as ShadcnCardHeader,
  CardContent as ShadcnCardContent,
  CardFooter as ShadcnCardFooter,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type CardVariant = 'default' | 'outlined' | 'elevated';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual style of the card */
  variant?: CardVariant;
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}
export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}
export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

const variantClasses: Record<CardVariant, string> = {
  default: '',
  outlined: 'shadow-none',
  elevated: 'shadow-md',
};

/**
 * Base card container. Add padding via `className` or a `<CardContent>` child.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', className, ...props }, ref) => (
    <ShadcnCard ref={ref} className={cn('overflow-hidden', variantClasses[variant], className)} {...props} />
  )
);
Card.displayName = 'Card';

/** Card header — applies consistent horizontal padding and a bottom border. */
export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, ...props }, ref) => (
    <ShadcnCardHeader
      ref={ref}
      className={cn('px-6 py-4 border-b border-[var(--color-border)]', className)}
      {...props}
    />
  )
);
CardHeader.displayName = 'CardHeader';

/** Card body — applies consistent padding. */
export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, ...props }, ref) => (
    <ShadcnCardContent
      ref={ref}
      className={cn('px-6 py-5 pt-5', className)}
      {...props}
    />
  )
);
CardContent.displayName = 'CardContent';

/** Card footer — applies consistent padding and a top border. */
export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, ...props }, ref) => (
    <ShadcnCardFooter
      ref={ref}
      className={cn('px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]', className)}
      {...props}
    />
  )
);
CardFooter.displayName = 'CardFooter';
