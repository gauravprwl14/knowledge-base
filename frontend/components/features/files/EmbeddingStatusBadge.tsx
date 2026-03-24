'use client';

/**
 * EmbeddingStatusBadge — color-coded pill badge showing a file's embedding status.
 *
 * Color coding (FR-10):
 *   pending      → gray
 *   processing   → blue with animated pulse
 *   embedded     → green
 *   failed       → red
 *   unsupported  → yellow/amber
 *   deleted      → muted red/slate
 */

import * as React from 'react';
import type { EmbeddingStatus } from '@/lib/api/files';

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const BADGE_STYLES: Record<EmbeddingStatus, string> = {
  pending:     'bg-slate-500/15 text-slate-400',
  processing:  'bg-blue-500/15 text-blue-400',
  embedded:    'bg-emerald-500/15 text-emerald-400',
  failed:      'bg-red-500/15 text-red-400',
  unsupported: 'bg-amber-500/15 text-amber-400',
  deleted:     'bg-slate-600/15 text-slate-500',
};

const BADGE_LABELS: Record<EmbeddingStatus, string> = {
  pending:     'Pending',
  processing:  'Processing',
  embedded:    'Embedded',
  failed:      'Failed',
  unsupported: 'Unsupported',
  deleted:     'Deleted',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface EmbeddingStatusBadgeProps {
  /** The derived embedding status to display. */
  status: EmbeddingStatus;
  /** Optional extra className for layout overrides. */
  className?: string;
}

/**
 * EmbeddingStatusBadge renders a compact pill badge for the embedding status.
 *
 * The `processing` status includes an animated pulse dot to indicate active work.
 */
export function EmbeddingStatusBadge({ status, className }: EmbeddingStatusBadgeProps) {
  const baseClasses = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide';
  const colorClasses = BADGE_STYLES[status] ?? BADGE_STYLES.pending;

  return (
    <span
      className={[baseClasses, colorClasses, className].filter(Boolean).join(' ')}
      data-testid={`embedding-status-badge-${status}`}
      aria-label={`Embedding status: ${BADGE_LABELS[status]}`}
    >
      {status === 'processing' && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse"
          aria-hidden="true"
        />
      )}
      {BADGE_LABELS[status]}
    </span>
  );
}
