/**
 * LoadingButton — button with integrated loading spinner
 *
 * Automatically disables and shows a spinner when `isLoading` is true.
 * The button text is replaced by `loadingText` if provided.
 *
 * @example
 * <LoadingButton
 *   isLoading={isSubmitting}
 *   loadingText="Saving..."
 *   variant="primary"
 *   onClick={handleSubmit}
 * >
 *   Save changes
 * </LoadingButton>
 */

import React from 'react';
import { Button, type ButtonProps } from './Button';

// ---------------------------------------------------------------------------
// Spinner (inline — avoids circular import from feedback/)
// ---------------------------------------------------------------------------

function ButtonSpinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoadingButtonProps extends ButtonProps {
  /** When true, shows spinner and disables the button */
  isLoading?: boolean;
  /** Text shown while loading (falls back to children if omitted) */
  loadingText?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Button with a built-in loading state. Disables interaction while loading.
 */
export const LoadingButton = React.forwardRef<
  HTMLButtonElement,
  LoadingButtonProps
>(({ isLoading = false, loadingText, disabled, children, ...rest }, ref) => {
  return (
    <Button ref={ref} disabled={disabled || isLoading} {...rest}>
      {isLoading && <ButtonSpinner />}
      {isLoading && loadingText ? loadingText : children}
    </Button>
  );
});

LoadingButton.displayName = 'LoadingButton';
