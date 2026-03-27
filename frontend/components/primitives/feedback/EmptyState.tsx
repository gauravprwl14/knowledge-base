/**
 * EmptyState — placeholder for empty lists / zero-data views
 *
 * Renders an icon, title, description, and an optional action button.
 * Centred by default; wrap in a `<Container>` for page-level use.
 *
 * @example
 * <EmptyState
 *   icon={<FileText className="w-10 h-10" />}
 *   title="No files yet"
 *   description="Upload your first file to get started."
 *   action={{ label: 'Upload file', onClick: openUploadModal }}
 * />
 */

import React from 'react';
import { Button } from '../button/Button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
}

export interface EmptyStateProps {
  /** Icon element rendered at the top — size via className on the element */
  icon?: React.ReactNode;
  /** Main heading */
  title: string;
  /** Supporting description text */
  description?: string;
  /** Optional call-to-action button */
  action?: EmptyStateAction;
  /** Additional className for the container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Empty state display for lists, search results, and zero-data views.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center text-center py-16 px-6',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon && (
        <div className="mb-4 text-neutral-300" aria-hidden="true">
          {icon}
        </div>
      )}

      <h3 className="text-base font-semibold text-neutral-900 mb-1">{title}</h3>

      {description && (
        <p className="text-sm text-neutral-500 max-w-sm mb-6">{description}</p>
      )}

      {action && (
        <Button
          variant={action.variant ?? 'primary'}
          size="md"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

EmptyState.displayName = 'EmptyState';
