'use client';

/**
 * Tags management page — /tags
 *
 * Shows all user tags as a grid of TagCards.
 * Each card displays the colored dot, name, file count, and edit/delete buttons.
 * A "+ New Tag" button in the header opens an inline create form.
 */

import * as React from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from '@/lib/hooks/use-files';
import { cn } from '@/lib/utils';
import type { KmsTag } from '@/lib/api/files';

// ---------------------------------------------------------------------------
// Preset colors for new/edited tags
// ---------------------------------------------------------------------------

const PRESET_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#8b5cf6', // violet
  '#14b8a6', // teal
];

// ---------------------------------------------------------------------------
// Tag card
// ---------------------------------------------------------------------------

interface TagCardProps {
  tag: KmsTag;
  onEdit: (id: string, name: string, color: string) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

/**
 * Individual tag card — shows color, name, file count, edit, and delete controls.
 */
function TagCard({ tag, onEdit, onDelete, isDeleting }: TagCardProps) {
  const [editing, setEditing] = React.useState(false);
  const [editName, setEditName] = React.useState(tag.name);
  const [editColor, setEditColor] = React.useState(tag.color);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  function handleSave() {
    if (!editName.trim()) return;
    onEdit(tag.id, editName.trim(), editColor);
    setEditing(false);
  }

  function handleCancelEdit() {
    setEditName(tag.name);
    setEditColor(tag.color);
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
      {editing ? (
        /* ------------------------------------------------------------------ */
        /* Edit mode                                                           */
        /* ------------------------------------------------------------------ */
        <>
          {/* Name input */}
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancelEdit();
            }}
            autoFocus
            maxLength={40}
            aria-label="Edit tag name"
            className="h-8 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Color swatches */}
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setEditColor(color)}
                className="relative h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: color,
                  borderColor: editColor === color ? 'white' : color,
                  outline: editColor === color ? `2px solid ${color}` : 'none',
                }}
                aria-label={`Pick color ${color}`}
                aria-pressed={editColor === color}
              >
                {editColor === color && (
                  <Check className="absolute inset-0 m-auto h-3 w-3 text-white" />
                )}
              </button>
            ))}
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!editName.trim()}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-xs font-medium text-white',
                editName.trim() ? 'bg-blue-500 hover:bg-blue-600' : 'cursor-not-allowed bg-blue-300',
              )}
            >
              <Check className="h-3 w-3" />
              Save
            </button>
            <button
              onClick={handleCancelEdit}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--color-border)] py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
          </div>
        </>
      ) : (
        /* ------------------------------------------------------------------ */
        /* Display mode                                                        */
        /* ------------------------------------------------------------------ */
        <>
          {/* Tag color dot + name */}
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-4 w-4 shrink-0 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
            <span className="flex-1 truncate font-medium text-[var(--color-text-primary)]">
              {tag.name}
            </span>
          </div>

          {/* File count */}
          <p className="text-sm text-[var(--color-text-secondary)]">
            {tag.fileCount} file{tag.fileCount !== 1 ? 's' : ''}
          </p>

          {/* Action row */}
          <div className="flex gap-2">
            {confirmDelete ? (
              /* Delete confirmation inline */
              <>
                <button
                  onClick={() => onDelete(tag.id)}
                  disabled={isDeleting}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md bg-red-500 py-1 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  {isDeleting ? 'Deleting…' : 'Confirm'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--color-border)] py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  aria-label={`Edit tag ${tag.name}`}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--color-border)] py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  aria-label={`Delete tag ${tag.name}`}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--color-border)] py-1 text-xs text-red-500 hover:border-red-200 hover:bg-red-50"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create tag form (inline in header area)
// ---------------------------------------------------------------------------

interface CreateTagFormProps {
  onClose: () => void;
}

function CreateTagForm({ onClose }: CreateTagFormProps) {
  const createTag = useCreateTag();
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState(PRESET_COLORS[0]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await createTag.mutateAsync({ name: name.trim(), color });
    onClose();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4"
    >
      {/* Name input */}
      <input
        type="text"
        placeholder="Tag name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        maxLength={40}
        required
        aria-label="New tag name"
        className="h-9 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Color swatches */}
      <div className="flex gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className="relative h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
            style={{
              backgroundColor: c,
              borderColor: color === c ? 'white' : c,
              outline: color === c ? `2px solid ${c}` : 'none',
            }}
            aria-label={`Pick color ${c}`}
          >
            {color === c && <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white" />}
          </button>
        ))}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={!name.trim() || createTag.isPending}
        className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
      >
        {createTag.isPending ? 'Creating…' : 'Create Tag'}
      </button>

      {/* Cancel */}
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
      >
        Cancel
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Tags management page — displays all tags with edit/delete and a create form.
 */
export default function TagsPage() {
  const { data: tags, isLoading, isError } = useTags();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const [showCreateForm, setShowCreateForm] = React.useState(false);

  function handleEdit(id: string, name: string, color: string) {
    updateTag.mutate({ id, name, color });
  }

  function handleDelete(id: string) {
    deleteTag.mutate(id);
  }

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      {/* ------------------------------------------------------------------ */}
      {/* Page header                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 font-bold text-[var(--color-text-primary)]">Tags</h1>
          <p className="mt-1 text-body-lg text-[var(--color-text-secondary)]">
            Organise your files with custom tags.
          </p>
        </div>

        {/* New tag button — hidden when create form is already open */}
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Tag
          </button>
        )}
      </div>

      {/* Inline create form */}
      {showCreateForm && <CreateTagForm onClose={() => setShowCreateForm(false)} />}

      {/* ------------------------------------------------------------------ */}
      {/* Loading skeleton                                                    */}
      {/* ------------------------------------------------------------------ */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl bg-[var(--color-bg-secondary)]"
              aria-hidden="true"
            />
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Error state                                                         */}
      {/* ------------------------------------------------------------------ */}
      {isError && !isLoading && (
        <p className="text-sm text-[var(--color-text-danger)]" role="alert">
          Failed to load tags. Please refresh the page.
        </p>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Empty state                                                         */}
      {/* ------------------------------------------------------------------ */}
      {!isLoading && !isError && !tags?.length && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-bg-secondary)]">
            <Plus className="h-8 w-8 text-[var(--color-text-secondary)]" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold text-[var(--color-text-primary)]">No tags yet</p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Create your first tag to start organising files.
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tag grid                                                            */}
      {/* ------------------------------------------------------------------ */}
      {!isLoading && !isError && !!tags?.length && (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {tags.map((tag: KmsTag) => (
            <TagCard
              key={tag.id}
              tag={tag}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isDeleting={deleteTag.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
