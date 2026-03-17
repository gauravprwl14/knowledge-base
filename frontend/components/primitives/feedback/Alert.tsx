/**
 * Alert — inline feedback banner
 *
 * Four semantic variants: info, success, warning, error.
 * Includes a matching icon, title (optional), and body text.
 * Optionally dismissible via the `onDismiss` prop.
 *
 * @example
 * <Alert variant="error" title="Login failed">
 *   Invalid email or password.
 * </Alert>
 */

import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import { alertVariantClasses } from '../../../lib/design-system/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  /** Semantic variant — controls colour and icon */
  variant?: AlertVariant;
  /** Optional bold title rendered above the body */
  title?: string;
  /** Body content — string or React nodes */
  children?: React.ReactNode;
  /** When provided, renders a dismiss button */
  onDismiss?: () => void;
  /** Additional className */
  className?: string;
}

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------

const icons: Record<AlertVariant, React.ComponentType<{ className?: string }>> =
  {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    error: AlertCircle,
  };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Inline alert / notification banner. Pure UI — no side effects.
 */
export function Alert({
  variant = 'info',
  title,
  children,
  onDismiss,
  className = '',
}: AlertProps) {
  const { container: containerCls, icon: iconCls } = alertVariantClasses[variant];
  const Icon = icons[variant];

  return (
    <div
      role="alert"
      className={[
        'flex gap-3 rounded-lg p-4',
        containerCls,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Icon */}
      <Icon className={['h-5 w-5 shrink-0 mt-0.5', iconCls].join(' ')} aria-hidden="true" />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {title && (
          <p className="text-sm font-semibold mb-1">{title}</p>
        )}
        {children && (
          <div className="text-sm">{children}</div>
        )}
      </div>

      {/* Dismiss button */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity duration-150"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

Alert.displayName = 'Alert';
