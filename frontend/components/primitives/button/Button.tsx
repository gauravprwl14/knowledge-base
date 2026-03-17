'use client';
import * as React from 'react';
import { Button as ShadcnButton, type ButtonProps as ShadcnButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ShadcnButtonProps, 'variant' | 'size'> {
  /** Visual variant — controls colour scheme */
  variant?: ButtonVariant;
  /** Size — controls height, padding, and font-size */
  size?: ButtonSize;
  /** Full-width block button */
  fullWidth?: boolean;
}

const variantMap: Record<ButtonVariant, ShadcnButtonProps['variant']> = {
  primary: 'default',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'destructive',
  outline: 'outline',
};

const sizeMap: Record<ButtonSize, ShadcnButtonProps['size']> = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
};

/**
 * Base button primitive. All other button variants (LoadingButton, IconButton)
 * are built on top of this component.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', fullWidth = false, className, ...props }, ref) => (
    <ShadcnButton
      ref={ref}
      variant={variantMap[variant]}
      size={sizeMap[size]}
      className={cn(fullWidth && 'w-full', className)}
      {...props}
    />
  )
);
Button.displayName = 'Button';
