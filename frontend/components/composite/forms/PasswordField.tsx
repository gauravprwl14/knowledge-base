/**
 * PasswordField — FormField pre-wired with PasswordInput
 *
 * Convenience composite for password inputs. Accepts all PasswordInput
 * props plus the FormField label/error/hint props.
 *
 * @example
 * <PasswordField
 *   label="Password"
 *   htmlFor="password"
 *   error={errors.password?.message}
 *   required
 *   {...register('password')}
 * />
 */

import React from 'react';
import { FormField, type FormFieldProps } from './FormField';
import { PasswordInput, type PasswordInputProps } from '../../primitives/input/PasswordInput';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PasswordFieldProps = Omit<FormFieldProps, 'children'> &
  PasswordInputProps;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Pre-composed password form field.
 * Separating label/error layout (FormField) from input behaviour (PasswordInput).
 */
export const PasswordField = React.forwardRef<
  HTMLInputElement,
  PasswordFieldProps
>(
  (
    {
      // FormField props
      label,
      htmlFor,
      error,
      hint,
      required,
      className,
      // PasswordInput props (rest)
      ...inputProps
    },
    ref
  ) => {
    return (
      <FormField
        label={label}
        htmlFor={htmlFor}
        error={error}
        hint={hint}
        required={required}
        className={className}
      >
        <PasswordInput
          ref={ref}
          error={!!error}
          {...inputProps}
        />
      </FormField>
    );
  }
);

PasswordField.displayName = 'PasswordField';
