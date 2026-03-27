'use client';
import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from './Button';

export interface LoadingButtonProps extends ButtonProps {
  /** When true, shows spinner and disables the button */
  isLoading?: boolean;
  /** Text shown while loading (falls back to children if omitted) */
  loadingText?: string;
}

/**
 * Button with a built-in loading state. Disables interaction while loading.
 */
export const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ isLoading = false, loadingText, children, disabled, ...props }, ref) => (
    <Button ref={ref} disabled={disabled || isLoading} {...props}>
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {isLoading && loadingText ? loadingText : children}
    </Button>
  )
);
LoadingButton.displayName = 'LoadingButton';
