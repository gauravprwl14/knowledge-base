'use client';

/**
 * FileCard — grid view card for a single KmsFile.
 *
 * Displays: checkbox, type badge, icon + filename, size/date, tag chips,
 * and hover action buttons (preview, add-to-collection, delete).
 *
 * Selection state is managed by the parent (FilesBrowser) via selectedIds.
 */

import * as React from 'react';
import { Eye, FolderPlus, Trash2 } from 'lucide-react';
import { FileTypeIcon, getFileTypeInfo } from './FileTypeIcon';
import { TranscriptionStatusBadge } from './TranscriptionStatusBadge';
import type { KmsFile, TranscriptionStatus } from '@/lib/api/files';
import { formatDistanceToNow } from '@/lib/utils';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats raw byte count into KB / MB / GB string. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Status → pill color mapping for the status badge (small dot in corner). */
const statusDotClass: Record<KmsFile['status'], string> = {
  INDEXED: 'bg-emerald-400',
  PENDING: 'bg-amber-400',
  PROCESSING: 'bg-blue-400',
  ERROR: 'bg-red-400',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FileCardProps {
  file: KmsFile;
  isSelected: boolean;
  /** Whether ANY file is currently selected (shows checkbox even when not hovered) */
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
 * Grid card for a single file.
 * Checkbox appears on hover OR when at least one file is already selected.
 */
export function FileCard({
  file,
  isSelected,
  anySelected,
  onSelect,
  onDelete,
  onAddToCollection,
  transcriptionJob,
}: FileCardProps) {
  const [hovered, setHovered] = React.useState(false);

  // Resolve icon + label from MIME type
  const { label: typeLabel, colorClass } = getFileTypeInfo(file.mimeType);

  // Detect audio/video files to conditionally show transcription badge
  const isAudioVideo =
    file.mimeType.startsWith('audio/') || file.mimeType.startsWith('video/');

  // Compute relative time since indexing (or creation if not yet indexed)
  const relativeTime = formatDistanceToNow(
    new Date(file.indexedAt ?? file.createdAt),
  );

  // Show only up to 3 tags; if more exist, render "+N more" chip
  const visibleTags = file.tags.slice(0, 3);
  const overflowCount = file.tags.length - visibleTags.length;

  // Checkbox visibility: show when hovered OR when any file selected
  const showCheckbox = hovered || anySelected;

  return (
    <div
      role="article"
      aria-label={file.name}
      aria-selected={isSelected}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(file.id, !isSelected)}
      className={cn(
        'group relative flex cursor-pointer flex-col gap-3 rounded-xl border bg-[var(--color-bg-primary)] p-4 transition-shadow',
        // Selected state: blue border
        isSelected
          ? 'border-blue-500 shadow-md ring-1 ring-blue-500'
          : 'border-[var(--color-border)] hover:shadow-md',
      )}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Top row: checkbox (left) + type badge (right)                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-start justify-between">
        {/* Checkbox — visible on hover or when selection is active */}
        <div
          className={cn(
            'transition-opacity',
            showCheckbox ? 'opacity-100' : 'opacity-0',
          )}
          onClick={(e) => {
            // Prevent the card's onClick from double-firing
            e.stopPropagation();
            onSelect(file.id, !isSelected);
          }}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(file.id, !isSelected)}
            aria-label={`Select ${file.name}`}
            className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-blue-500"
          />
        </div>

        {/* Status dot + type badge pill */}
        <div className="flex items-center gap-1.5">
          {/* Processing status indicator dot */}
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              statusDotClass[file.status],
            )}
            title={file.status}
          />
          {/* MIME type label pill */}
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              colorClass,
              'border-current bg-current/10',
            )}
          >
            {typeLabel}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Center: icon + filename                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col items-center gap-2 py-2">
        <FileTypeIcon mimeType={file.mimeType} className="h-10 w-10" />
        <p
          className="line-clamp-2 text-center text-sm font-medium text-[var(--color-text-primary)]"
          title={file.name}
        >
          {file.name}
        </p>
        {isAudioVideo && transcriptionJob && (
          <TranscriptionStatusBadge job={transcriptionJob} />
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom: size + relative time                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
        <span>{formatBytes(file.sizeBytes)}</span>
        <span>indexed {relativeTime}</span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tag chips row                                                       */}
      {/* ------------------------------------------------------------------ */}
      {file.tags.length > 0 && (
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
              +{overflowCount} more
            </span>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Hover action buttons — appear at top-right corner on hover          */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={cn(
          'absolute right-2 top-10 flex flex-col gap-1 transition-opacity',
          hovered && !anySelected ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Preview button (placeholder — no preview route yet) */}
        <button
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] shadow hover:text-blue-500"
          title="Preview"
          onClick={() => {/* TODO: open preview panel */}}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>

        {/* Add to collection */}
        <button
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] shadow hover:text-blue-500"
          title="Add to collection"
          onClick={() => onAddToCollection(file.id)}
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>

        {/* Delete */}
        <button
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] shadow hover:text-red-500"
          title="Delete file"
          onClick={() => onDelete(file.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
