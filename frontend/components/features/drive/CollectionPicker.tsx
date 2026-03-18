'use client';

/**
 * CollectionPicker — floating dropdown for adding selected files to a collection.
 *
 * Features:
 *  - List of user collections from useCollections()
 *  - "+ New collection" inline name input
 *  - On select: calls onSelect(collectionId)
 *
 * The parent (BulkActionBar) controls visibility and positioning.
 */

import * as React from 'react';
import { Plus, Folder } from 'lucide-react';
import { useCollections, useCreateCollection } from '@/lib/hooks/use-collections';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CollectionPickerProps {
  /** Called when the user picks or creates a collection — passes the collection ID */
  onSelect: (collectionId: string) => void;
  /** Called when the picker should close */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Floating collection picker dropdown.
 * Renders a list of existing collections and an inline "New collection" form.
 */
export function CollectionPicker({ onSelect, onClose }: CollectionPickerProps) {
  const { data: collections, isLoading } = useCollections();
  const createCollection = useCreateCollection();

  // Whether the inline create form is expanded
  const [creating, setCreating] = React.useState(false);
  // New collection name input
  const [newName, setNewName] = React.useState('');

  // Close on Escape
  React.useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Create and immediately select the new collection
  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const created = await createCollection.mutateAsync({ name: newName.trim() });
      onSelect(created.id);
      onClose();
    } catch {
      // Error state managed by useMutation — no-op here
    }
  }

  return (
    // Backdrop click closes picker
    <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true">
      {/* Picker panel */}
      <div
        className="absolute z-50 w-64 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Collection picker"
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          Add to Collection
        </p>

        {/* Collection list */}
        <ul className="max-h-52 overflow-y-auto" role="listbox">
          {isLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <li
                key={i}
                className="mb-1 h-8 animate-pulse rounded-md bg-[var(--color-bg-secondary)]"
                aria-hidden="true"
              />
            ))}

          {!isLoading && !collections?.length && (
            <li className="py-2 text-center text-xs text-[var(--color-text-secondary)]">
              No collections yet
            </li>
          )}

          {(collections ?? []).map((col) => (
            <li key={col.id}>
              <button
                role="option"
                aria-selected="false"
                onClick={() => { onSelect(col.id); onClose(); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]"
              >
                {/* Folder icon */}
                <Folder className="h-4 w-4 shrink-0 text-blue-400" aria-hidden="true" />
                <span className="flex-1 truncate text-left">{col.name}</span>
                {/* File count */}
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {col.fileCount}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/* Divider */}
        <div className="my-2 border-t border-[var(--color-border)]" />

        {/* Inline create form */}
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-blue-500 hover:bg-blue-50"
          >
            <Plus className="h-3.5 w-3.5" />
            New collection
          </button>
        ) : (
          <div className="space-y-2">
            {/* Name input */}
            <input
              type="text"
              placeholder="Collection name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setCreating(false);
              }}
              autoFocus
              maxLength={80}
              aria-label="New collection name"
              className="h-8 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Create / Cancel */}
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || createCollection.isPending}
                className={cn(
                  'flex-1 rounded-md py-1 text-xs font-medium text-white',
                  newName.trim()
                    ? 'bg-blue-500 hover:bg-blue-600'
                    : 'cursor-not-allowed bg-blue-300',
                )}
              >
                {createCollection.isPending ? 'Creating…' : 'Create'}
              </button>
              <button
                onClick={() => setCreating(false)}
                className="flex-1 rounded-md border border-[var(--color-border)] py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
