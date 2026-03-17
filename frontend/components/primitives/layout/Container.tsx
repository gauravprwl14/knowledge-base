/**
 * Container — responsive max-width wrapper
 *
 * Centres content horizontally with consistent horizontal padding.
 * Three size variants for different content widths.
 *
 * @example
 * <Container size="lg">
 *   <PageContent />
 * </Container>
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContainerSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Maximum width of the container */
  size?: ContainerSize;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Class maps
// ---------------------------------------------------------------------------

const sizeClasses: Record<ContainerSize, string> = {
  sm: 'max-w-xl',
  md: 'max-w-3xl',
  lg: 'max-w-5xl',
  xl: 'max-w-7xl',
  full: 'max-w-full',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Responsive max-width container with horizontal padding.
 * Use `size="xl"` for full-width page layouts.
 */
export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ size = 'xl', className = '', children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={[
          'w-full mx-auto px-4 sm:px-6 lg:px-8',
          sizeClasses[size],
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

Container.displayName = 'Container';
