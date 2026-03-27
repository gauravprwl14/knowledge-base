import * as React from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { Alert as ShadcnAlert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

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

const iconMap: Record<AlertVariant, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

const shadcnVariantMap: Record<AlertVariant, 'info' | 'success' | 'warning' | 'destructive'> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'destructive',
};

/**
 * Inline alert / notification banner. Pure UI — no side effects.
 */
export function Alert({ variant = 'info', title, children, onDismiss, className = '' }: AlertProps) {
  const Icon = iconMap[variant];
  return (
    <ShadcnAlert variant={shadcnVariantMap[variant]} className={cn('relative', className)}>
      <Icon className="h-4 w-4" />
      {title && <AlertTitle>{title}</AlertTitle>}
      {children && <AlertDescription>{children}</AlertDescription>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute right-3 top-3 opacity-60 hover:opacity-100 transition-opacity"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </ShadcnAlert>
  );
}
Alert.displayName = 'Alert';
