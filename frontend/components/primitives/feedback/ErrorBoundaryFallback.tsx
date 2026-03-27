/**
 * ErrorBoundaryFallback — error boundary fallback UI
 *
 * Renders a user-friendly error screen when an error boundary catches
 * an uncaught rendering exception. Includes error details (in dev) and
 * a retry button.
 *
 * Usage with a class-based ErrorBoundary:
 * ```tsx
 * class ErrorBoundary extends React.Component {
 *   state = { error: null };
 *   static getDerivedStateFromError(error) { return { error }; }
 *   render() {
 *     if (this.state.error) {
 *       return <ErrorBoundaryFallback error={this.state.error} onRetry={() => this.setState({ error: null })} />;
 *     }
 *     return this.props.children;
 *   }
 * }
 * ```
 */

import React from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import { Button } from '../button/Button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ErrorBoundaryFallbackProps {
  /** The caught error */
  error?: Error | null;
  /** Called when the user clicks "Try again" */
  onRetry?: () => void;
  /** Override the default heading */
  title?: string;
  /** Override the default body message */
  message?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Fallback UI for React Error Boundaries. Shows a friendly error screen
 * with optional retry. In development, displays the error message.
 */
export function ErrorBoundaryFallback({
  error,
  onRetry,
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again or contact support if the problem persists.',
}: ErrorBoundaryFallbackProps) {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[400px] px-6 py-16 text-center"
    >
      <AlertOctagon
        className="h-12 w-12 text-red-400 mb-4"
        aria-hidden="true"
      />

      <h2 className="text-lg font-semibold text-neutral-900 mb-2">{title}</h2>

      <p className="text-sm text-neutral-500 max-w-md mb-2">{message}</p>

      {isDev && error && (
        <details className="mt-4 text-left w-full max-w-lg">
          <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-600 mb-2">
            Error details (development only)
          </summary>
          <pre className="text-xs bg-neutral-50 border border-neutral-200 rounded-md p-3 overflow-auto text-red-600 whitespace-pre-wrap">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
          </pre>
        </details>
      )}

      {onRetry && (
        <Button
          variant="secondary"
          size="md"
          onClick={onRetry}
          className="mt-6"
        >
          <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}

ErrorBoundaryFallback.displayName = 'ErrorBoundaryFallback';
