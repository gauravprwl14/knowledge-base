'use client';

/**
 * PasswordInput — input with show/hide toggle
 *
 * Extends `Input` with a visibility toggle button. The toggle button does
 * not submit the form. `aria-label` on the toggle changes based on state.
 *
 * @example
 * <PasswordInput
 *   placeholder="Enter your password"
 *   error={!!errors.password}
 *   {...register('password')}
 * />
 */

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from './Input';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PasswordInputProps = Omit<InputProps, 'type' | 'suffix'>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Password input with a show/hide toggle. The underlying input type
 * switches between `password` and `text`.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  PasswordInputProps
>((props, ref) => {
  const [visible, setVisible] = useState(false);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault(); // prevent form submit
    setVisible((v) => !v);
  };

  const toggleButton = (
    <button
      type="button"
      onClick={toggle}
      aria-label={visible ? 'Hide password' : 'Show password'}
      className="text-neutral-400 hover:text-neutral-600 transition-colors duration-150 pointer-events-auto"
    >
      {visible ? (
        <EyeOff className="w-4 h-4" aria-hidden="true" />
      ) : (
        <Eye className="w-4 h-4" aria-hidden="true" />
      )}
    </button>
  );

  return (
    <Input
      ref={ref}
      type={visible ? 'text' : 'password'}
      suffix={toggleButton}
      {...props}
    />
  );
});

PasswordInput.displayName = 'PasswordInput';
