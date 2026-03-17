/**
 * FormField — composite form field
 *
 * Composes Label + helper text + error message around any input child.
 * The child input is passed as `children` — FormField only provides
 * the surrounding label, hint, and error layout.
 *
 * Accessibility:
 * - Generates a unique `id` if none is provided via `htmlFor`
 * - Error message has `role="alert"` for live announcements
 * - `aria-describedby` links input to error/hint messages
 *
 * @example
 * <FormField
 *   label="Email address"
 *   htmlFor="email"
 *   error={errors.email?.message}
 *   hint="We'll never share your email."
 *   required
 * >
 *   <Input id="email" type="email" error={!!errors.email} {...register('email')} />
 * </FormField>
 */

import React, { useId } from 'react';
import { Label } from '../../primitives/typography/Label';
import { Text } from '../../primitives/typography/Text';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormFieldProps {
  /** Label text displayed above the input */
  label: string;
  /** htmlFor on the label — links to the input's id */
  htmlFor?: string;
  /** Error message — when truthy, rendered in red below the input */
  error?: string | null;
  /** Helper text rendered below the input (hidden when error is shown) */
  hint?: string;
  /** Adds required asterisk to the label */
  required?: boolean;
  /** The input element (Input, PasswordInput, SearchInput, etc.) */
  children: React.ReactNode;
  /** Additional className for the wrapper div */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Wraps any input primitive with a consistent label, hint, and error layout.
 * Pure UI — no validation logic. Pair with react-hook-form or similar.
 */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required = false,
  children,
  className = '',
}: FormFieldProps) {
  const generatedId = useId();
  const fieldId = htmlFor ?? generatedId;

  const errorId = error ? `${fieldId}-error` : undefined;
  const hintId = hint && !error ? `${fieldId}-hint` : undefined;

  return (
    <div className={['flex flex-col gap-1.5', className].filter(Boolean).join(' ')}>
      {/* Label */}
      <Label htmlFor={fieldId} required={required}>
        {label}
      </Label>

      {/* Input — clone to inject aria-describedby */}
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
            id: (children as React.ReactElement<{ id?: string }>).props.id ?? fieldId,
            'aria-describedby':
              errorId ?? hintId ?? undefined,
          })
        : children}

      {/* Error message */}
      {error && (
        <Text
          as="span"
          size="xs"
          color="error"
          role="alert"
          id={errorId}
        >
          {error}
        </Text>
      )}

      {/* Hint text (hidden when error is visible) */}
      {hint && !error && (
        <Text as="span" size="xs" color="muted" id={hintId}>
          {hint}
        </Text>
      )}
    </div>
  );
}

FormField.displayName = 'FormField';
