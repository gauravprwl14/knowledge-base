/**
 * Input — primitive text input component
 *
 * Thin wrapper around `<input>` with design system styling, error state,
 * and forwarded ref. Compatible with react-hook-form's register pattern.
 *
 * @example
 * <Input
 *   type="email"
 *   placeholder="you@example.com"
 *   error={!!errors.email}
 *   {...register('email')}
 * />
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  /** When true, applies error ring styling */
  error?: boolean;
  /** Rendered before the input (icon or text) */
  prefix?: React.ReactNode;
  /** Rendered after the input (icon, button, or text) */
  suffix?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Base classes
// ---------------------------------------------------------------------------

const baseInputClasses = [
  'block w-full rounded-md border bg-white px-3 py-2',
  'text-sm text-neutral-900 placeholder:text-neutral-400',
  'focus:outline-none focus:ring-2 focus:ring-offset-0',
  'transition-colors duration-150',
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-neutral-50',
].join(' ');

const normalBorderClasses = 'border-neutral-300 focus:border-indigo-500 focus:ring-indigo-500/20';
const errorBorderClasses = 'border-red-400 focus:border-red-500 focus:ring-red-500/20';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Base input primitive. When `prefix` or `suffix` is provided, the input
 * is wrapped in a flex container — the ref still points to the `<input>`.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, prefix, suffix, className = '', ...rest }, ref) => {
    const borderCls = error ? errorBorderClasses : normalBorderClasses;

    const inputEl = (
      <input
        ref={ref}
        className={[
          baseInputClasses,
          borderCls,
          prefix ? 'pl-9' : '',
          suffix ? 'pr-9' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        aria-invalid={error || undefined}
        {...rest}
      />
    );

    if (!prefix && !suffix) return inputEl;

    return (
      <div className="relative">
        {prefix && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-neutral-400">
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
