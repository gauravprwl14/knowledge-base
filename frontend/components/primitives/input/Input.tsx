'use client';
import * as React from 'react';
import { Input as ShadcnInput } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  /** When true, applies error ring styling */
  error?: boolean;
  /** Rendered before the input (icon or text) */
  prefix?: React.ReactNode;
  /** Rendered after the input (icon, button, or text) */
  suffix?: React.ReactNode;
}

/**
 * Base input primitive. When `prefix` or `suffix` is provided, the input
 * is wrapped in a flex container — the ref still points to the `<input>`.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, prefix, suffix, className, ...props }, ref) => {
    const inputEl = (
      <ShadcnInput
        ref={ref}
        className={cn(
          error && 'border-[var(--color-status-error)] focus-visible:ring-[var(--color-status-error)]',
          prefix && 'pl-9',
          suffix && 'pr-9',
          className
        )}
        aria-invalid={error || undefined}
        {...props}
      />
    );

    if (!prefix && !suffix) return inputEl;

    return (
      <div className="relative">
        {prefix && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-[var(--color-text-muted)]">
            {prefix}
          </div>
        )}
        {inputEl}
        {suffix && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            {suffix}
          </div>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
