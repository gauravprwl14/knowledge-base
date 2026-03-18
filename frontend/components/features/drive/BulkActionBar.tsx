'use client';

/**
 * BulkActionBar — fixed bottom bar shown when one or more files are selected.
 *
 * Displays:
 *  - Selected file count
 *  - [Add to Collection] → opens CollectionPicker
 *  - [Add Tag] → opens TagPicker
 *  - [Delete] → shows confirmation dialog
 *  - [Clear Selection]
 *
 * This component manages picker/dialog visibility state locally;
 * all data mutations are delegated to parent callbacks.
 */

import * as React from 'react';
import { FolderPlus, Tag, Trash2, X } from 'lucide-react';
import { TagPicker } from './TagPicker';
import { CollectionPicker } from './CollectionPicker';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BulkActionBarProps {
  /** Number of currently selected files */
  selectedCount: number;
  /** Clear the selection */
  onClearSelection: () => void;
  /** Delete all selected files */
  onDelete: () => void;
  /** Add all selected files to a collection */
  onAddToCollection: (collectionId: string) => void;
  /** Apply a tag to all selected files */
  onAddTag: (tagId: string) => void;
  /** True while a bulk action mutation is in flight */
  isPending?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Fixed bottom action bar for bulk operations on selected files.
 * Animates in from the bottom when selectedCount > 0.
 */
export function BulkActionBar({
  selectedCount,
  onClearSelection,
  onDelete,
  onAddToCollection,
  onAddTag,
  isPending = false,
}: BulkActionBarProps) {
  // Which picker/dialog is currently open
  const [open, setOpen] = React.useState<'tag' | 'collection' | 'delete' | null>(null);

  // Anchors for picker positioning (attached to respective buttons)
  const tagBtnRef = React.useRef<HTMLButtonElement>(null);
  const collectionBtnRef = React.useRef<HTMLButtonElement>(null);

  // Don't render the bar at all when nothing is selected
  if (selectedCount === 0) return null;

  function handleDelete() {
    onDelete();
    setOpen(null);
  }

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Fixed bottom bar                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div
        role="toolbar"
        aria-label="Bulk actions"
        className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-200"
      >
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-5 py-3 shadow-xl">
          {/* Selected count badge */}
          <span className="rounded-full bg-blue-500 px-2.5 py-0.5 text-xs font-semibold text-white">
            {selectedCount} selected
          </span>

          {/* Divider */}
          <div className="h-5 w-px bg-[var(--color-border)]" />

          {/* Add to Collection button */}
          <button
            ref={collectionBtnRef}
            onClick={() => setOpen(open === 'collection' ? null : 'collection')}
            disabled={isPending}
            aria-label="Add to collection"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            Add to Collection
          </button>

          {/* Add Tag button */}
          <button
            ref={tagBtnRef}
            onClick={() => setOpen(open === 'tag' ? null : 'tag')}
            disabled={isPending}
            aria-label="Add tag"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
          >
            <Tag className="h-4 w-4" aria-hidden="true" />
            Add Tag
          </button>

          {/* Delete button */}
          <button
            onClick={() => setOpen('delete')}
            disabled={isPending}
            aria-label="Delete selected files"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete
          </button>

          {/* Clear selection */}
          <button
            onClick={onClearSelection}
            aria-label="Clear selection"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tag picker — positioned above the tag button                        */}
      {/* ------------------------------------------------------------------ */}
      {open === 'tag' && (
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            left: (() => {
              const rect = tagBtnRef.current?.getBoundingClientRect();
              return rect ? `${rect.left}px` : '50%';
            })(),
          }}
          className="z-50"
        >
          <TagPicker
            onSelect={(tagId) => {
              onAddTag(tagId);
              setOpen(null);
            }}
            onClose={() => setOpen(null)}
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Collection picker — positioned above the collection button          */}
      {/* ------------------------------------------------------------------ */}
      {open === 'collection' && (
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            left: (() => {
              const rect = collectionBtnRef.current?.getBoundingClientRect();
              return rect ? `${rect.left}px` : '50%';
            })(),
          }}
          className="z-50"
        >
          <CollectionPicker
            onSelect={(collectionId) => {
              onAddToCollection(collectionId);
              setOpen(null);
            }}
            onClose={() => setOpen(null)}
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Delete confirmation dialog                                          */}
      {/* ------------------------------------------------------------------ */}
      {open === 'delete' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog heading */}
            <h3
              id="delete-dialog-title"
              className="text-base font-semibold text-[var(--color-text-primary)]"
            >
              Delete {selectedCount} file{selectedCount !== 1 ? 's' : ''}?
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              This will permanently remove the selected{' '}
              {selectedCount !== 1 ? 'files' : 'file'} from the knowledge base.
              This action cannot be undone.
            </p>

            {/* Action buttons */}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setOpen(null)}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {isPending ? 'Deleting…' : `Delete ${selectedCount} file${selectedCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
