'use client';

import * as React from 'react';
import { Check, ChevronRight, Folder, FolderOpen, Loader2, X } from 'lucide-react';
import { Button } from '@/components/primitives/button/Button';
import { kmsSourcesApi, type DriveFolder } from '@/lib/api/sources';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FolderPickerModalProps {
  sourceId: string;
  /** Initially selected folder IDs (from existing source config) */
  initialSelection?: string[];
  open: boolean;
  onClose: () => void;
  /** Called with the final set of selected folder IDs after saving */
  onSave: (folderIds: string[]) => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FolderRow({
  folder,
  selected,
  onToggle,
  onExpand,
  isExpanded,
  hasChildren,
}: {
  folder: DriveFolder;
  selected: boolean;
  onToggle: (id: string) => void;
  onExpand: (id: string) => void;
  isExpanded: boolean;
  hasChildren: boolean;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--color-bg-secondary)]">
      {/* Expand arrow — only shown when folder has children */}
      <button
        type="button"
        onClick={() => onExpand(folder.id)}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
        style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
      >
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Checkbox */}
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        onClick={() => onToggle(folder.id)}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          selected
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
            : 'border-[var(--color-border)] bg-transparent'
        }`}
      >
        {selected && <Check className="h-2.5 w-2.5 text-white" aria-hidden="true" />}
      </button>

      {/* Folder icon + name */}
      <button
        type="button"
        onClick={() => onToggle(folder.id)}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        {isExpanded
          ? <FolderOpen className="h-4 w-4 shrink-0 text-yellow-500" aria-hidden="true" />
          : <Folder className="h-4 w-4 shrink-0 text-yellow-500" aria-hidden="true" />
        }
        <span className="truncate text-sm text-[var(--color-text-primary)]">{folder.name}</span>
        {folder.childCount > 0 && (
          <span className="ml-1 text-xs text-[var(--color-text-secondary)]">({folder.childCount})</span>
        )}
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FolderPickerModal({
  sourceId,
  initialSelection = [],
  open,
  onClose,
  onSave,
}: FolderPickerModalProps) {
  const [folders, setFolders] = React.useState<DriveFolder[]>([]);
  const [childFolders, setChildFolders] = React.useState<Record<string, DriveFolder[]>>({});
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<Set<string>>(new Set(initialSelection));
  const [loading, setLoading] = React.useState(false);
  const [loadingChild, setLoadingChild] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Load root folders when modal opens
  React.useEffect(() => {
    if (!open) return;
    setSelected(new Set(initialSelection));
    setExpanded(new Set());
    setChildFolders({});
    setError(null);

    setLoading(true);
    kmsSourcesApi
      .listDriveFolders(sourceId, 'root')
      .then(({ folders: list }) => setFolders(list))
      .catch(() => setError('Failed to load Drive folders. Make sure your Google Drive is connected.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceId]);

  if (!open) return null;

  function toggleFolder(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function expandFolder(id: string) {
    if (expanded.has(id)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }

    // Load children if not already cached
    if (!childFolders[id]) {
      setLoadingChild(id);
      try {
        const { folders: children } = await kmsSourcesApi.listDriveFolders(sourceId, id);
        setChildFolders((prev) => ({ ...prev, [id]: children }));
      } catch {
        // Non-fatal — just don't expand
      } finally {
        setLoadingChild(null);
      }
    }

    setExpanded((prev) => new Set([...prev, id]));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await kmsSourcesApi.updateConfig(sourceId, { syncFolderIds: Array.from(selected) });
      onSave(Array.from(selected));
      onClose();
    } catch {
      setError('Failed to save folder selection. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function renderFolderList(list: DriveFolder[], depth = 0) {
    return (
      <ul className={depth > 0 ? 'ml-6 border-l border-[var(--color-border)] pl-2' : ''}>
        {list.map((folder) => (
          <React.Fragment key={folder.id}>
            <FolderRow
              folder={folder}
              selected={selected.has(folder.id)}
              onToggle={toggleFolder}
              onExpand={expandFolder}
              isExpanded={expanded.has(folder.id)}
              hasChildren={folder.childCount > 0 || Boolean(childFolders[folder.id]?.length)}
            />
            {loadingChild === folder.id && (
              <li className="ml-10 flex items-center gap-2 py-1 text-xs text-[var(--color-text-secondary)]">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                Loading…
              </li>
            )}
            {expanded.has(folder.id) && childFolders[folder.id] && (
              renderFolderList(childFolders[folder.id], depth + 1)
            )}
          </React.Fragment>
        ))}
      </ul>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="folder-picker-title"
    >
      <div className="flex w-full max-w-lg flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-xl"
           style={{ maxHeight: '80vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2 id="folder-picker-title" className="font-semibold text-[var(--color-text-primary)]">
            Select folders to sync
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close folder picker"
            className="rounded-md p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Help text */}
        <p className="px-5 pt-3 text-sm text-[var(--color-text-secondary)]">
          {selected.size === 0
            ? 'No folders selected — all Drive files will be indexed.'
            : `${selected.size} folder${selected.size !== 1 ? 's' : ''} selected — only these will be synced.`}
        </p>

        {/* Folder tree */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" aria-label="Loading folders" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : folders.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
              No folders found in your Google Drive.
            </p>
          ) : (
            renderFolderList(folders)
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-4">
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            Clear selection
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || loading}>
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
