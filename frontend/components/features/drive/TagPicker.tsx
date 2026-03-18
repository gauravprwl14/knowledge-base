'use client';

/**
 * TagPicker — floating dropdown for applying a tag to selected files.
 *
 * Features:
 *  - Search input to filter existing tags
 *  - List of existing tags with colored dots
 *  - "+ Create tag" inline form with name input and 6 preset color swatches
 *  - On tag select: calls onSelect(tagId)
 *
 * The parent (BulkActionBar) is responsible for positioning and visibility.
 */

import * as React from 'react';
import { Plus, Check, Search } from 'lucide-react';
import { useTags, useCreateTag } from '@/lib/hooks/use-files';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Preset tag colors
// ---------------------------------------------------------------------------

const PRESET_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TagPickerProps {
  /** Called when the user selects (or creates) a tag — passes the tag ID */
  onSelect: (tagId: string) => void;
  /** Called when the picker should be closed */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Floating tag picker dropdown.
 * Renders a search-filtered tag list plus an inline create form.
 */
export function TagPicker({ onSelect, onClose }: TagPickerProps) {
  const { data: tags, isLoading } = useTags();
  const createTag = useCreateTag();

  // Search query for filtering existing tags
  const [search, setSearch] = React.useState('');
  // Whether the inline create form is expanded
  const [creating, setCreating] = React.useState(false);
  // New tag form state
  const [newName, setNewName] = React.useState('');
  const [newColor, setNewColor] = React.useState(PRESET_COLORS[0]);

  // Close on Escape key
  React.useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Filter tags by search query
  const filtered = (tags ?? []).filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Create a new tag and immediately select it
  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const created = await createTag.mutateAsync({ name: newName.trim(), color: newColor });
      onSelect(created.id);
      onClose();
    } catch {
      // Error state handled by useMutation — no-op here
    }
  }

  return (
    // Backdrop click closes the picker
    <div
      className="fixed inset-0 z-40"
      onClick={onClose}
      aria-hidden="true"
    >
      {/* Picker panel — stop propagation so it doesn't close itself */}
      <div
        className="absolute z-50 w-64 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Tag picker"
      >
        {/* Search input */}
        <div className="relative mb-2">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-secondary)]"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            aria-label="Search tags"
            className="h-8 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Tag list */}
        <ul className="max-h-48 overflow-y-auto" role="listbox" aria-label="Existing tags">
          {isLoading &&
            // Skeleton placeholders while loading
            Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="h-8 animate-pulse rounded-md bg-[var(--color-bg-secondary)] mb-1" aria-hidden="true" />
            ))}

          {!isLoading && filtered.length === 0 && (
            <li className="py-2 text-center text-xs text-[var(--color-text-secondary)]">
              No matching tags
            </li>
          )}

          {filtered.map((tag) => (
            <li key={tag.id}>
              <button
                role="option"
                aria-selected="false"
                onClick={() => { onSelect(tag.id); onClose(); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]"
              >
                {/* Tag color dot */}
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="flex-1 truncate text-left">{tag.name}</span>
                {/* File count */}
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {tag.fileCount}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/* Divider */}
        <div className="my-2 border-t border-[var(--color-border)]" />

        {/* Create tag section */}
        {!creating ? (
          // Collapsed: just a "+ Create tag" button
          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-blue-500 hover:bg-blue-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Create tag
          </button>
        ) : (
          // Expanded inline create form
          <div className="space-y-2">
            {/* Name input */}
            <input
              type="text"
              placeholder="Tag name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setCreating(false);
              }}
              autoFocus
              maxLength={40}
              aria-label="New tag name"
              className="h-8 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Color swatches */}
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewColor(color)}
                  className="relative h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor: newColor === color ? 'white' : color,
                    outline: newColor === color ? `2px solid ${color}` : 'none',
                  }}
                  aria-label={`Select color ${color}`}
                  aria-pressed={newColor === color}
                >
                  {newColor === color && (
                    <Check className="absolute inset-0 m-auto h-3 w-3 text-white" />
                  )}
                </button>
              ))}
            </div>

            {/* Create / Cancel buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || createTag.isPending}
                className={cn(
                  'flex-1 rounded-md py-1 text-xs font-medium text-white',
                  newName.trim() ? 'bg-blue-500 hover:bg-blue-600' : 'cursor-not-allowed bg-blue-300',
                )}
              >
                {createTag.isPending ? 'Creating…' : 'Create'}
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
