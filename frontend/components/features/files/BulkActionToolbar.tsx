'use client';

/**
 * BulkActionToolbar — sticky action bar shown when ≥1 file is selected.
 *
 * Features (FR-04, FR-05, FR-06, FR-08, FR-12, FR-14):
 * - Shows selected file count
 * - Delete button (opens confirmation modal)
 * - Re-embed button (calls bulk-re-embed endpoint)
 * - "Clear selection" link
 * - Bulk actions disabled + warning when >100 files selected
 */

import * as React from 'react';
import { Trash2, RefreshCw, X, AlertTriangle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BULK_ACTION_FILES = 100;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BulkActionToolbarProps {
  /** Count of currently selected files. */
  selectedCount: number;
  /** Called when the Delete button is clicked (opens confirmation modal). */
  onDeleteClick: () => void;
  /** Called when the Re-embed button is clicked. */
  onReEmbedClick: () => void;
  /** Called when the "Clear selection" link is clicked. */
  onClearSelection: () => void;
  /** Whether the delete operation is currently in progress. */
  isDeleting?: boolean;
  /** Whether the re-embed operation is currently in progress. */
  isReEmbedding?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * BulkActionToolbar renders the selection action bar.
 * It is only mounted when selectedCount ≥ 1 (the parent controls visibility).
 */
export function BulkActionToolbar({
  selectedCount,
  onDeleteClick,
  onReEmbedClick,
  onClearSelection,
  isDeleting = false,
  isReEmbedding = false,
}: BulkActionToolbarProps) {
  const overLimit = selectedCount > MAX_BULK_ACTION_FILES;
  const busyOrOverLimit = isDeleting || isReEmbedding || overLimit;

  return (
    <div
      className="flex flex-col gap-2"
      data-testid="bulk-action-toolbar"
    >
      {/* Over-limit warning (FR-14) */}
      {overLimit && (
        <div
          className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-400"
          data-testid="bulk-over-limit-warning"
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Bulk actions are limited to {MAX_BULK_ACTION_FILES} files at a time.
            You have {selectedCount} selected. Deselect some files to continue.
          </span>
        </div>
      )}

      {/* Main toolbar */}
      <div
        className="flex items-center justify-between gap-4 rounded-xl border border-[#a78bfa]/30 bg-[#a78bfa]/10 px-4 py-3"
        data-testid="bulk-action-bar"
      >
        <span className="text-sm text-slate-200" data-testid="bulk-selected-count">
          {selectedCount} {selectedCount === 1 ? 'file' : 'files'} selected
        </span>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Re-embed button (FR-08) */}
          <button
            onClick={onReEmbedClick}
            disabled={busyOrOverLimit}
            data-testid="bulk-re-embed-btn"
            aria-label={`Re-embed ${selectedCount} selected files`}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 px-3 py-1.5 text-sm font-medium text-blue-400 hover:bg-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw
              className={['h-4 w-4', isReEmbedding ? 'animate-spin' : ''].join(' ')}
              aria-hidden="true"
            />
            {isReEmbedding ? 'Queueing…' : 'Re-embed'}
          </button>

          {/* Delete button (FR-05 opens modal) */}
          <button
            onClick={onDeleteClick}
            disabled={busyOrOverLimit}
            data-testid="bulk-delete-btn"
            aria-label={`Delete ${selectedCount} selected files`}
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {isDeleting ? 'Deleting…' : `Delete ${selectedCount}`}
          </button>

          {/* Clear selection link */}
          <button
            onClick={onClearSelection}
            disabled={isDeleting || isReEmbedding}
            data-testid="bulk-clear-selection-btn"
            aria-label="Clear file selection"
            className="text-sm text-slate-500 hover:text-slate-300 disabled:opacity-40 transition-colors underline underline-offset-2"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
