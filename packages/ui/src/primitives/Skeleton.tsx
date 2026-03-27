import * as React from 'react';
import { cn } from '../lib/cn';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Skeleton — shimmer loading placeholder.
 *
 * Renders an `animate-pulse` div that visually represents content
 * that is still loading. Use inside viewer Loading sub-components
 * while content is fetching from the API.
 *
 * @example
 * <Skeleton className="h-64 w-full rounded-lg" />
 */
export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        // animate-pulse creates the shimmer effect via Tailwind's animation utility
        className={cn('animate-pulse rounded-md bg-slate-800', className)}
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';
