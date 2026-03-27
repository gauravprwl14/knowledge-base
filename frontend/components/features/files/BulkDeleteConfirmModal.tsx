'use client';

/**
 * BulkDeleteConfirmModal — confirmation dialog before executing a bulk delete.
 *
 * Displays a warning summary: "Delete N files? This cannot be undone."
 * Provides Cancel and Confirm (Delete) buttons.
 */

import * as React from 'react';
import { Trash2, X, AlertTriangle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BulkDeleteConfirmModalProps {
  /** Number of files selected for deletion. */
  count: number;
  /** Called when the user cancels (closes) the modal. */
  onCancel: () => void;
  /** Called when the user confirms the deletion. */
  onConfirm: () => void;
  /** Whether the delete operation is in progress. */
  isDeleting?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * BulkDeleteConfirmModal renders a modal overlay asking the user to confirm
 * deletion of the selected files.
 */
export function BulkDeleteConfirmModal({
  count,
  onCancel,
  onConfirm,
  isDeleting = false,
}: BulkDeleteConfirmModalProps) {
  // Close on backdrop click
  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !isDeleting) {
      onCancel();
    }
  }

  // Close on Escape key
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isDeleting) {
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, isDeleting]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
      data-testid="bulk-delete-confirm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-delete-modal-title"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0f1117] p-6 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onCancel}
          disabled={isDeleting}
          aria-label="Close modal"
          data-testid="modal-close-btn"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 disabled:opacity-40 transition-colors"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* Icon + Title */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center justify-center h-12 w-12 rounded-2xl border border-red-500/30 bg-red-500/10">
            <AlertTriangle className="h-6 w-6 text-red-400" aria-hidden="true" />
          </div>

          <div>
            <h2
              id="bulk-delete-modal-title"
              className="text-lg font-semibold text-slate-100"
              data-testid="modal-title"
            >
              Delete {count} {count === 1 ? 'file' : 'files'}?
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              This cannot be undone. The selected {count === 1 ? 'file' : 'files'} will be
              permanently removed from your knowledge base.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            data-testid="modal-cancel-btn"
            className="flex-1 sm:flex-none rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            data-testid="modal-confirm-btn"
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {isDeleting ? 'Deleting…' : `Delete ${count} ${count === 1 ? 'file' : 'files'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
