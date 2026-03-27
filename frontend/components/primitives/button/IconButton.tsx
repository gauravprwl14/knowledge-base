'use client';
import * as React from 'react';
import { Button as ShadcnButton, type ButtonProps as ShadcnButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ButtonVariant, ButtonSize } from './Button';

export interface IconButtonProps extends Omit<ShadcnButtonProps, 'variant' | 'size'> {
  /** Accessible label — required for screen readers */
  'aria-label': string;
  /** Visual variant */
  variant?: ButtonVariant;
  /** Controls the icon container size */
  size?: ButtonSize;
}

const variantMap: Record<ButtonVariant, ShadcnButtonProps['variant']> = {
  primary: 'default',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'destructive',
  outline: 'outline',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
};

/**
 * Square icon-only button. Requires `aria-label` for accessibility.
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = 'ghost', size = 'md', className, ...props }, ref) => (
    <ShadcnButton
      ref={ref}
      variant={variantMap[variant]}
      size="icon"
      className={cn(sizeClasses[size], className)}
      {...props}
    />
  )
);
IconButton.displayName = 'IconButton';
