'use client';

import * as React from 'react';
import {
  Check,
  ChevronRight,
  ChevronsDown,
  Folder,
  FolderOpen,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/primitives/button/Button';
import { kmsSourcesApi, type DriveFolder } from '@/lib/api/sources';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result passed to the onSave callback. */
export interface FolderSaveResult {
  folderIds: string[];
  /** Map of folderId → true for folders where "select all children" was toggled. */
  selectAllChildrenMap: Record<string, boolean>;
}

export interface FolderPickerModalProps {
  sourceId: string;
  /** Initially selected folder IDs (from existing source config). */
  initialSelection?: string[];
  open: boolean;
  onClose: () => void;
  /** Called with the final folder selection after saving. */
  onSave: (result: FolderSaveResult) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a flat list of all visible (rendered) nodes in DFS order from the
 * root list, taking expanded state into account.  Used for keyboard navigation.
 */
function buildVisibleList(
  list: DriveFolder[],
  childFolders: Record<string, DriveFolder[]>,
  expanded: Set<string>,
): DriveFolder[] {
  const result: DriveFolder[] = [];
  function walk(items: DriveFolder[]) {
    for (const f of items) {
      result.push(f);
      if (expanded.has(f.id) && childFolders[f.id]) {
        walk(childFolders[f.id]);
      }
    }
  }
  walk(list);
  return result;
}

/**
 * Return all loaded descendants of a folder (recursive).
 */
function collectDescendants(
  folderId: string,
  childFolders: Record<string, DriveFolder[]>,
): string[] {
  const result: string[] = [];
  function walk(id: string) {
    const children = childFolders[id] ?? [];
    for (const c of children) {
      result.push(c.id);
      walk(c.id);
    }
  }
  walk(folderId);
  return result;
}

/**
 * Return the path segments for a folder by walking ancestry.
 * Builds a map of id → parent id from a list of root + child folder maps.
 */
function buildPathLabel(
  folderId: string,
  folders: DriveFolder[],
  childFolders: Record<string, DriveFolder[]>,
): string {
  // Build id → {folder, parentId} map
  const nodeMap: Record<string, { folder: DriveFolder; parentId: string | null }> = {};

  function index(items: DriveFolder[], parentId: string | null) {
    for (const f of items) {
      nodeMap[f.id] = { folder: f, parentId };
      if (childFolders[f.id]) {
        index(childFolders[f.id], f.id);
      }
    }
  }
  index(folders, null);

  const parts: string[] = [];
  let current: string | null = folderId;
  while (current && nodeMap[current]) {
    parts.unshift(nodeMap[current].folder.name);
    current = nodeMap[current].parentId;
  }
  if (parts.length === 0) return folderId;
  return ['My Drive', ...parts].join(' > ');
}

// ---------------------------------------------------------------------------
// Sub-component: FolderRow
// ---------------------------------------------------------------------------

interface FolderRowProps {
  folder: DriveFolder;
  depth: number;
  selected: boolean;
  inheritedSelected: boolean;
  selectAllChildren: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  isLoadingChildren: boolean;
  isFocused: boolean;
  onToggle: (id: string) => void;
  onExpand: (id: string) => void;
  onToggleSelectAll: (id: string) => void;
  rowRef: (el: HTMLLIElement | null) => void;
}

/**
 * A single row in the folder tree with connecting-line decoration.
 *
 * Connecting line approach (CSS):
 *  - Each row renders `depth` guide-rail divs before the content.
 *  - Guide-rail divs are `w-5` with a centered `border-l` that runs the full
 *    height.  The last segment is replaced by a T-connector: a `border-l` that
 *    runs only the top half, plus an `border-t` horizontal connector.
 *  - All guide segments use `absolute`/`relative` positioning inside a
 *    fixed-width column — no SVG, no extra packages.
 */
function FolderRow({
  folder,
  depth,
  selected,
  inheritedSelected,
  selectAllChildren,
  hasChildren,
  isExpanded,
  isLoadingChildren,
  isFocused,
  onToggle,
  onExpand,
  onToggleSelectAll,
  rowRef,
}: FolderRowProps) {
  const checkboxState: 'selected' | 'inherited' | 'none' = selected
    ? 'selected'
    : inheritedSelected
    ? 'inherited'
    : 'none';

  return (
    <li
      ref={rowRef}
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-selected={selected || inheritedSelected}
      tabIndex={isFocused ? 0 : -1}
      data-folder-id={folder.id}
      className={`flex items-center rounded-lg px-1 py-1 transition-colors outline-none
        ${isFocused ? 'ring-1 ring-[var(--color-accent)]' : ''}
        hover:bg-[var(--color-bg-secondary)]`}
    >
      {/* Connecting-line guide rails */}
      {Array.from({ length: depth }).map((_, i) => {
        const isLast = i === depth - 1;
        return (
          <span
            key={i}
            aria-hidden="true"
            className="relative inline-flex shrink-0 flex-col items-center"
            style={{ width: 20, alignSelf: 'stretch' }}
          >
            {/* Vertical guide rail — runs full height for non-last segments */}
            {!isLast && (
              <span
                className="absolute inset-0 left-1/2 border-l border-[var(--color-border)]"
                style={{ transform: 'translateX(-50%)' }}
              />
            )}
            {/* T-connector for the last depth segment */}
            {isLast && (
              <>
                {/* top half of vertical bar */}
                <span
                  className="absolute left-1/2 top-0 border-l border-[var(--color-border)]"
                  style={{ transform: 'translateX(-50%)', height: '50%' }}
                />
                {/* horizontal connector */}
                <span
                  className="absolute top-1/2 border-t border-[var(--color-border)]"
                  style={{ left: '50%', right: 0 }}
                />
              </>
            )}
          </span>
        );
      })}

      {/* Expand / collapse button */}
      <button
        type="button"
        onClick={() => onExpand(folder.id)}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
        tabIndex={-1}
        style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
      >
        {isLoadingChildren ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : (
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Checkbox */}
      <button
        type="button"
        role="checkbox"
        aria-checked={selected || inheritedSelected}
        onClick={() => onToggle(folder.id)}
        tabIndex={-1}
        title={inheritedSelected ? 'Covered by parent selection' : undefined}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors
          ${
            checkboxState === 'selected'
              ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
              : checkboxState === 'inherited'
              ? 'border-[var(--color-accent)] bg-[var(--color-accent)] opacity-40'
              : 'border-[var(--color-border)] bg-transparent'
          }`}
      >
        {(checkboxState === 'selected' || checkboxState === 'inherited') && (
          <Check className="h-2.5 w-2.5 text-white" aria-hidden="true" />
        )}
      </button>

      {/* Folder icon + name */}
      <button
        type="button"
        onClick={() => onToggle(folder.id)}
        tabIndex={-1}
        className="flex min-w-0 flex-1 items-center gap-1.5 pl-1.5 text-left"
      >
        {isExpanded ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-yellow-500" aria-hidden="true" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-yellow-500" aria-hidden="true" />
        )}
        <span
          className={`truncate text-sm ${
            inheritedSelected && !selected
              ? 'text-[var(--color-text-secondary)]'
              : 'text-[var(--color-text-primary)]'
          }`}
        >
          {folder.name}
        </span>
        {folder.childCount > 0 && (
          <span className="ml-1 shrink-0 text-xs text-[var(--color-text-secondary)]">
            ({folder.childCount})
          </span>
        )}
      </button>

      {/* "Select all children" toggle — only for folders that have children */}
      {hasChildren && (
        <button
          type="button"
          onClick={() => onToggleSelectAll(folder.id)}
          tabIndex={-1}
          title={selectAllChildren ? 'Deselect all children' : 'Select all children'}
          aria-label={selectAllChildren ? 'Deselect all children' : 'Select all children'}
          className={`ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors
            ${
              selectAllChildren
                ? 'text-[var(--color-accent)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
        >
          <ChevronsDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * FolderPickerModal — production-quality tree picker for Google Drive folders.
 *
 * Features:
 * - Visual connecting lines (CSS, no SVG/extra packages)
 * - Search/filter with flat results when active
 * - "Select all children" propagation per folder
 * - Inherited-selection indicators for children of selected parents
 * - Keyboard navigation (ArrowUp/Down, ArrowLeft/Right, Space, Enter)
 * - Full ARIA tree semantics
 * - Breadcrumb bar showing path to most recently expanded folder
 * - Selected folder summary expandable on click
 */
export function FolderPickerModal({
  sourceId,
  initialSelection = [],
  open,
  onClose,
  onSave,
}: FolderPickerModalProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [folders, setFolders] = React.useState<DriveFolder[]>([]);
  const [childFolders, setChildFolders] = React.useState<Record<string, DriveFolder[]>>({});
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<Set<string>>(new Set(initialSelection));
  const [selectAllChildrenMap, setSelectAllChildrenMap] = React.useState<Record<string, boolean>>({});
  const [loading, setLoading] = React.useState(false);
  const [loadingChild, setLoadingChild] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [summaryExpanded, setSummaryExpanded] = React.useState(false);
  const [breadcrumb, setBreadcrumb] = React.useState<string>('');

  // ── Refs ───────────────────────────────────────────────────────────────────
  /** Ref for keyboard focus — NOT state, avoids full re-renders. */
  const focusedIdRef = React.useRef<string | null>(null);
  /** Map from folderId → li element for imperative focus. */
  const rowEls = React.useRef<Record<string, HTMLLIElement | null>>({});
  const treeRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  // ── Load root folders ──────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) return;
    setSelected(new Set(initialSelection));
    setExpanded(new Set());
    setChildFolders({});
    setSelectAllChildrenMap({});
    setError(null);
    setSearchQuery('');
    setSummaryExpanded(false);
    setBreadcrumb('');
    focusedIdRef.current = null;

    setLoading(true);
    kmsSourcesApi
      .listDriveFolders(sourceId, 'root')
      .then(({ folders: list }) => setFolders(list))
      .catch(() =>
        setError('Failed to load Drive folders. Make sure your Google Drive is connected.'),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceId]);

  if (!open) return null;

  // ── Derived data ───────────────────────────────────────────────────────────

  /** All loaded folder nodes in DFS order (visible in tree). */
  const visibleList = buildVisibleList(folders, childFolders, expanded);

  /** Filtered list for search mode — memoised equivalent done inline with useMemo below. */
  const isSearchActive = searchQuery.trim().length > 0;

  // Flatten ALL loaded nodes for search
  const allLoadedFolders = React.useMemo<DriveFolder[]>(() => {
    const result: DriveFolder[] = [];
    function collect(items: DriveFolder[]) {
      for (const f of items) {
        result.push(f);
        if (childFolders[f.id]) collect(childFolders[f.id]);
      }
    }
    collect(folders);
    return result;
  }, [folders, childFolders]);

  const filteredFolders = React.useMemo<DriveFolder[]>(() => {
    if (!isSearchActive) return [];
    const q = searchQuery.toLowerCase();
    return allLoadedFolders.filter((f) => f.name.toLowerCase().includes(q));
  }, [isSearchActive, searchQuery, allLoadedFolders]);

  /** Rows to render — flat search results when searching, tree order otherwise. */
  const displayRows = isSearchActive ? filteredFolders : visibleList;

  /** Set of folder IDs whose ancestors are selected → inherited indicator. */
  const inheritedSet = React.useMemo<Set<string>>(() => {
    const result = new Set<string>();
    for (const selId of selected) {
      const descendants = collectDescendants(selId, childFolders);
      for (const d of descendants) result.add(d);
    }
    return result;
  }, [selected, childFolders]);

  // ── Handlers ───────────────────────────────────────────────────────────────

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

    // Update breadcrumb
    const path = buildPathLabel(id, folders, childFolders);
    setBreadcrumb(path);

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

  function toggleSelectAllChildren(folderId: string) {
    setSelectAllChildrenMap((prev) => {
      const next = { ...prev };
      if (next[folderId]) {
        delete next[folderId];
        // Remove all descendants from selected set
        const descendants = collectDescendants(folderId, childFolders);
        setSelected((sel) => {
          const nextSel = new Set(sel);
          for (const d of descendants) nextSel.delete(d);
          return nextSel;
        });
      } else {
        next[folderId] = true;
        // Add all loaded descendants to selected set
        const descendants = collectDescendants(folderId, childFolders);
        setSelected((sel) => {
          const nextSel = new Set(sel);
          for (const d of descendants) nextSel.add(d);
          return nextSel;
        });
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const folderIds = Array.from(selected);
      await kmsSourcesApi.updateConfig(sourceId, { syncFolderIds: folderIds });
      onSave({ folderIds, selectAllChildrenMap });
      onClose();
    } catch {
      setError('Failed to save folder selection. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const currentId = focusedIdRef.current;
    const idx = currentId ? displayRows.findIndex((f) => f.id === currentId) : -1;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIdx = Math.min(idx + 1, displayRows.length - 1);
        const nextId = displayRows[nextIdx]?.id;
        if (nextId) {
          focusedIdRef.current = nextId;
          rowEls.current[nextId]?.focus();
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIdx = Math.max(idx - 1, 0);
        const prevId = displayRows[prevIdx]?.id;
        if (prevId) {
          focusedIdRef.current = prevId;
          rowEls.current[prevId]?.focus();
        }
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (currentId) expandFolder(currentId);
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (currentId && expanded.has(currentId)) {
          setExpanded((prev) => {
            const next = new Set(prev);
            next.delete(currentId);
            return next;
          });
        }
        break;
      }
      case ' ': {
        e.preventDefault();
        if (currentId) toggleFolder(currentId);
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (!saving && !loading) handleSave();
        break;
      }
      default:
        break;
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function getDepth(folderId: string): number {
    if (isSearchActive) return 0;
    // Walk childFolders to find depth
    function findDepth(items: DriveFolder[], d: number): number {
      for (const f of items) {
        if (f.id === folderId) return d;
        if (childFolders[f.id]) {
          const found = findDepth(childFolders[f.id], d + 1);
          if (found >= 0) return found;
        }
      }
      return -1;
    }
    const d = findDepth(folders, 0);
    return d >= 0 ? d : 0;
  }

  function hasChildren(folder: DriveFolder): boolean {
    return folder.childCount > 0 || Boolean(childFolders[folder.id]?.length);
  }

  // Selected folder summary
  const selectedNames: string[] = [];
  if (summaryExpanded) {
    for (const id of selected) {
      selectedNames.push(buildPathLabel(id, folders, childFolders));
    }
  }

  // ── JSX ────────────────────────────────────────────────────────────────────

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
      <div
        className="flex w-full max-w-lg flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-xl"
        style={{ maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2
            id="folder-picker-title"
            className="font-semibold text-[var(--color-text-primary)]"
          >
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

        {/* Summary / help text */}
        <div className="px-5 pt-3">
          {selected.size === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              No folders selected — all Drive files will be indexed.
            </p>
          ) : (
            <button
              type="button"
              className="text-left text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              onClick={() => setSummaryExpanded((v) => !v)}
              aria-expanded={summaryExpanded}
              aria-label="Show selected folder paths"
            >
              {selected.size} folder{selected.size !== 1 ? 's' : ''} selected —{' '}
              <span className="underline underline-offset-2">
                {summaryExpanded ? 'hide paths ▲' : 'show paths ▼'}
              </span>
            </button>
          )}
          {summaryExpanded && selectedNames.length > 0 && (
            <ul className="mt-1.5 max-h-24 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-2">
              {selectedNames.map((name, i) => (
                <li key={i} className="truncate text-xs text-[var(--color-text-secondary)]">
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Breadcrumb bar */}
        {breadcrumb && (
          <p
            className="truncate px-5 pt-1.5 text-xs text-[var(--color-text-secondary)]"
            aria-label="Currently expanded folder path"
          >
            {breadcrumb}
          </p>
        )}

        {/* Search input */}
        <div className="px-4 pt-3">
          <div className="relative flex items-center">
            <Search
              className="absolute left-2.5 h-3.5 w-3.5 text-[var(--color-text-secondary)]"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search folders…"
              aria-label="Search folders"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-1.5 pl-8 pr-8 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-2 rounded p-0.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Folder tree / search results */}
        <div
          ref={treeRef}
          role="tree"
          aria-label="Google Drive folders"
          className="flex-1 overflow-y-auto px-4 py-3 outline-none"
          onKeyDown={handleKeyDown}
          tabIndex={0}
          onFocus={() => {
            // Set focus to first row if nothing is focused yet
            if (!focusedIdRef.current && displayRows.length > 0) {
              focusedIdRef.current = displayRows[0].id;
              rowEls.current[displayRows[0].id]?.focus();
            }
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2
                className="h-6 w-6 animate-spin text-[var(--color-accent)]"
                aria-label="Loading folders"
              />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : folders.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
              No folders found in your Google Drive.
            </p>
          ) : isSearchActive && filteredFolders.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
              No folders match &ldquo;{searchQuery}&rdquo;.
            </p>
          ) : (
            <ul>
              {displayRows.map((folder) => {
                const depth = getDepth(folder.id);
                const isExpanded = expanded.has(folder.id);
                const isFolderSelected = selected.has(folder.id);
                const isInherited = !isFolderSelected && inheritedSet.has(folder.id);
                const hc = hasChildren(folder);
                const isFocused = focusedIdRef.current === folder.id;

                return (
                  <FolderRow
                    key={folder.id}
                    folder={folder}
                    depth={depth}
                    selected={isFolderSelected}
                    inheritedSelected={isInherited}
                    selectAllChildren={Boolean(selectAllChildrenMap[folder.id])}
                    hasChildren={hc}
                    isExpanded={isExpanded}
                    isLoadingChildren={loadingChild === folder.id}
                    isFocused={isFocused}
                    onToggle={toggleFolder}
                    onExpand={expandFolder}
                    onToggleSelectAll={toggleSelectAllChildren}
                    rowRef={(el) => {
                      rowEls.current[folder.id] = el;
                    }}
                  />
                );
              })}
            </ul>
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
