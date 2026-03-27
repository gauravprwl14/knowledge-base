'use client';

/**
 * FileRow — list view row for a single KmsFile.
 *
 * Columns: Checkbox | Type icon | Filename | Source | Size | Date | Status badge | Tags | Actions
 * Used inside a <table> rendered by FilesBrowser when viewMode === 'list'.
 */

import * as React from 'react';
import { Eye, FolderPlus, Trash2 } from 'lucide-react';
import { FileTypeIcon } from './FileTypeIcon';
import { TranscriptionStatusBadge } from './TranscriptionStatusBadge';
import type { KmsFile, TranscriptionStatus } from '@/lib/api/files';
import { formatDistanceToNow, cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats byte count to human-readable string. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Status → badge styling */
const statusBadgeClass: Record<
  KmsFile['status'],
  { text: string; bg: string }
> = {
  INDEXED: { text: 'text-emerald-700', bg: 'bg-emerald-50' },
  PENDING: { text: 'text-amber-700', bg: 'bg-amber-50' },
  PROCESSING: { text: 'text-blue-700', bg: 'bg-blue-50' },
  ERROR: { text: 'text-red-700', bg: 'bg-red-50' },
  UNSUPPORTED: { text: 'text-yellow-700', bg: 'bg-yellow-50' },
  DELETED: { text: 'text-gray-500', bg: 'bg-gray-100' },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FileRowProps {
  file: KmsFile;
  /** Display name of the source (looked up by sourceId in parent) */
  sourceName: string;
  isSelected: boolean;
  /** Whether ANY file is selected (keeps checkboxes visible) */
  anySelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onDelete: (id: string) => void;
  onAddToCollection: (id: string) => void;
  /** Transcription job status; shown for audio/video files when provided. */
  transcriptionJob?: TranscriptionStatus | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Table row for list view.
 * Checkboxes are always visible when anySelected is true; otherwise shown on hover.
 */
export function FileRow({
  file,
  sourceName,
  isSelected,
  anySelected,
  onSelect,
  onDelete,
  onAddToCollection,
  transcriptionJob,
}: FileRowProps) {
  const [hovered, setHovered] = React.useState(false);

  // Detect audio/video files to conditionally show transcription badge
  const isAudioVideo =
    file.mimeType.startsWith('audio/') || file.mimeType.startsWith('video/');

  const { text: statusText, bg: statusBg } = statusBadgeClass[file.status];
  const relativeTime = formatDistanceToNow(
    new Date(file.indexedAt ?? file.createdAt),
  );

  // Show only up to 2 tags inline in list view
  const visibleTags = (file.tags ?? []).slice(0, 2);
  const overflowCount = (file.tags?.length ?? 0) - visibleTags.length;

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(file.id, !isSelected)}
      className={cn(
        'cursor-pointer border-b border-[var(--color-border)] transition-colors',
        isSelected
          ? 'bg-blue-50 dark:bg-blue-950/20'
          : 'hover:bg-[var(--color-bg-secondary)]',
      )}
    >
      {/* Checkbox cell */}
      <td className="w-10 px-3 py-3">
        <div
          className={cn(
            'transition-opacity',
            hovered || anySelected ? 'opacity-100' : 'opacity-0',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(file.id, !isSelected)}
            aria-label={`Select ${file.name}`}
            className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-blue-500"
          />
        </div>
      </td>

      {/* Type icon cell */}
      <td className="w-10 px-2 py-3">
        <FileTypeIcon mimeType={file.mimeType} className="h-5 w-5" />
      </td>

      {/* Filename cell — truncated with title tooltip */}
      <td className="max-w-xs px-3 py-3">
        <p
          className="truncate text-sm font-medium text-[var(--color-text-primary)]"
          title={file.name}
        >
          {file.name}
        </p>
        <p className="truncate text-xs text-[var(--color-text-secondary)]">
          {file.path}
        </p>
        {isAudioVideo && transcriptionJob && (
          <TranscriptionStatusBadge job={transcriptionJob} className="mt-1" />
        )}
      </td>

      {/* Source name cell */}
      <td className="hidden px-3 py-3 text-sm text-[var(--color-text-secondary)] md:table-cell">
        {sourceName}
      </td>

      {/* File size cell */}
      <td className="hidden whitespace-nowrap px-3 py-3 text-sm text-[var(--color-text-secondary)] lg:table-cell">
        {formatBytes(file.sizeBytes)}
      </td>

      {/* Date cell */}
      <td className="hidden whitespace-nowrap px-3 py-3 text-sm text-[var(--color-text-secondary)] lg:table-cell">
        {relativeTime}
      </td>

      {/* Status badge cell */}
      <td className="hidden px-3 py-3 sm:table-cell">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
            statusText,
            statusBg,
          )}
        >
          {file.status.toLowerCase()}
        </span>
      </td>

      {/* Tags cell */}
      <td className="hidden px-3 py-3 xl:table-cell">
        <div className="flex flex-wrap gap-1">
          {visibleTags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="rounded-full bg-[var(--color-bg-secondary)] px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
              +{overflowCount}
            </span>
          )}
        </div>
      </td>

      {/* Action buttons cell — visible on hover */}
      <td
        className="w-24 px-3 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            'flex items-center gap-1 transition-opacity',
            hovered ? 'opacity-100' : 'opacity-0',
          )}
        >
          {/* Preview */}
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-blue-500"
            title="Preview"
            onClick={() => {/* TODO: preview panel */}}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>

          {/* Add to collection */}
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-blue-500"
            title="Add to collection"
            onClick={() => onAddToCollection(file.id)}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>

          {/* Delete */}
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-red-500"
            title="Delete"
            onClick={() => onDelete(file.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
