/**
 * Card — surface container primitive
 *
 * Three visual variants: default (light shadow), outlined (2px border), and
 * elevated (stronger shadow). Includes a rounded corner and consistent padding.
 *
 * @example
 * <Card variant="elevated" className="p-6">
 *   <CardHeader>
 *     <Heading as="h3" size="lg">API Keys</Heading>
 *   </CardHeader>
 *   <CardContent>...</CardContent>
 * </Card>
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CardVariant = 'default' | 'outlined' | 'elevated';

// ---------------------------------------------------------------------------
// Variant map
// ---------------------------------------------------------------------------

const cardVariantClasses: Record<CardVariant, string> = {
  default: 'bg-[var(--color-surface)] shadow-sm',
  outlined: 'bg-[var(--color-surface)] border border-[var(--color-border)]',
  elevated: 'bg-[var(--color-surface)] shadow-md',
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual style of the card */
  variant?: CardVariant;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

/**
 * Base card container. Add padding via `className` or a `<CardContent>` child.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', className = '', children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={[
          'rounded-lg overflow-hidden',
          cardVariantClasses[variant],
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

Card.displayName = 'Card';

// ---------------------------------------------------------------------------
// CardHeader
// ---------------------------------------------------------------------------

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/** Card header — applies consistent horizontal padding and a bottom border. */
export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className = '', children, ...rest }, ref) => (
    <div
      ref={ref}
      className={['px-6 py-4 border-b border-neutral-100', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  )
);

CardHeader.displayName = 'CardHeader';

// ---------------------------------------------------------------------------
// CardContent
// ---------------------------------------------------------------------------

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/** Card body — applies consistent padding. */
export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className = '', children, ...rest }, ref) => (
    <div
      ref={ref}
      className={['px-6 py-5', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </div>
  )
);

CardContent.displayName = 'CardContent';

// ---------------------------------------------------------------------------
// CardFooter
// ---------------------------------------------------------------------------

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/** Card footer — applies consistent padding and a top border. */
export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className = '', children, ...rest }, ref) => (
    <div
      ref={ref}
      className={[
        'px-6 py-4 border-t border-neutral-100 bg-neutral-50',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  )
);

CardFooter.displayName = 'CardFooter';
