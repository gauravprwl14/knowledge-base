'use client';
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from './Input';

export type PasswordInputProps = Omit<InputProps, 'type' | 'suffix'>;

/**
 * Password input with a show/hide toggle. The underlying input type
 * switches between `password` and `text`.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  (props, ref) => {
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
        className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors duration-150 pointer-events-auto"
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
  }
);

PasswordInput.displayName = 'PasswordInput';
