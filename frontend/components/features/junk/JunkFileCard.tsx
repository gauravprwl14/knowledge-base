'use client';

/**
 * JunkFileCard — a single row in the Junk page file list.
 *
 * Displays: type icon, name, source, size, error message, created date.
 * Provides per-file Delete and Retry (ERROR only) actions.
 */

import * as React from 'react';
import { Trash2, RefreshCw } from 'lucide-react';
import { FileTypeIcon } from '@/components/features/drive/FileTypeIcon';
import type { KmsFile } from '@/lib/api/files';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface JunkFileCardProps {
  /** The file to display */
  file: KmsFile;
  /** Whether this row is currently selected for bulk operations */
  isSelected: boolean;
  /** Called when the checkbox selection changes */
  onSelectToggle: (id: string) => void;
  /** Called after a successful delete */
  onDeleted: (id: string) => void;
  /** Called after a successful retry — passes file id and new status */
  onRetried: (id: string) => void;
  /** Injected API methods — allows test mocking without module mocking */
  api: {
    delete: (id: string) => Promise<void>;
    retry: (id: string) => Promise<void>;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A single junk file row with delete + retry actions.
 */
export function JunkFileCard({
  file,
  isSelected,
  onSelectToggle,
  onDeleted,
  onRetried,
  api,
}: JunkFileCardProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [rowError, setRowError] = React.useState<string | null>(null);

  const isError = file.status === 'ERROR';

  async function handleDelete() {
    setIsDeleting(true);
    setRowError(null);
    try {
      await api.delete(file.id);
      onDeleted(file.id);
    } catch {
      setRowError('Delete failed. Please try again.');
      setIsDeleting(false);
    }
  }

  async function handleRetry() {
    setIsRetrying(true);
    setRowError(null);
    try {
      await api.retry(file.id);
      onRetried(file.id);
    } catch {
      setRowError('Retry failed. Please try again.');
      setIsRetrying(false);
    }
  }

  const isBusy = isDeleting || isRetrying;

  return (
    <tr
      className={[
        'transition-colors',
        isSelected
          ? 'bg-[#a78bfa]/5'
          : 'hover:bg-[var(--color-bg-secondary)]',
      ].join(' ')}
      data-testid="junk-file-row"
    >
      {/* Checkbox */}
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelectToggle(file.id)}
          aria-label={`Select ${file.name}`}
          className="w-4 h-4 rounded border-white/20 bg-white/5 text-[#a78bfa] accent-[#a78bfa]"
        />
      </td>

      {/* Icon + Name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <FileTypeIcon mimeType={file.mimeType} className="w-5 h-5 shrink-0" />
          <div className="min-w-0">
            <p
              className="text-sm font-medium text-[var(--color-text-primary)] truncate max-w-[220px]"
              title={file.name}
            >
              {file.name}
            </p>
            {rowError && (
              <p className="text-xs text-red-400 mt-0.5">{rowError}</p>
            )}
          </div>
        </div>
      </td>

      {/* Source */}
      <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)] font-mono hidden md:table-cell truncate max-w-[100px]">
        {file.sourceId.slice(0, 8)}&hellip;
      </td>

      {/* Size */}
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)] hidden sm:table-cell whitespace-nowrap">
        {formatBytes(file.sizeBytes)}
      </td>

      {/* Status badge */}
      <td className="px-4 py-3 hidden sm:table-cell">
        {isError ? (
          <span className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400 border border-red-500/20">
            Error
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-medium text-slate-400 border border-white/10">
            {file.status}
          </span>
        )}
      </td>

      {/* Created date */}
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)] hidden lg:table-cell whitespace-nowrap">
        {formatDate(file.createdAt)}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {isError && (
            <button
              onClick={handleRetry}
              disabled={isBusy}
              aria-label={`Retry ${file.name}`}
              data-testid="retry-btn"
              className="inline-flex items-center gap-1 rounded-lg border border-[#a78bfa]/30 px-2.5 py-1 text-xs font-medium text-[#a78bfa] hover:bg-[#a78bfa]/10 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />
              {isRetrying ? 'Retrying\u2026' : 'Retry'}
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={isBusy}
            aria-label={`Delete ${file.name}`}
            data-testid="delete-btn"
            className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="w-3 h-3" aria-hidden="true" />
            {isDeleting ? 'Deleting\u2026' : 'Delete'}
          </button>
        </div>
      </td>
    </tr>
  );
}
