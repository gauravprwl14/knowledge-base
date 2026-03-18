'use client';

/**
 * FilesToolbar — top bar of the file browser.
 *
 * Left:   result count ("showing X of Y files")
 * Center: search input (debounced 300 ms, updates URL param via callback)
 * Right:  view-mode toggle (grid / list) + sort dropdown
 */

import * as React from 'react';
import { Search, LayoutGrid, List, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViewMode = 'grid' | 'list';
export type SortField = 'name' | 'createdAt' | 'sizeBytes' | 'mimeType';
export type SortDir = 'asc' | 'desc';

export interface SortState {
  field: SortField;
  dir: SortDir;
}

export interface FilesToolbarProps {
  /** Current number of loaded files */
  count: number;
  /** Total matching files (from API response) */
  total: number;
  /** Current search string */
  search: string;
  onSearchChange: (value: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  /** Whether a fetch is in-progress (disables inputs) */
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Sort options
// ---------------------------------------------------------------------------

const SORT_OPTIONS: { label: string; field: SortField; dir: SortDir }[] = [
  { label: 'Name (A → Z)', field: 'name', dir: 'asc' },
  { label: 'Name (Z → A)', field: 'name', dir: 'desc' },
  { label: 'Newest first', field: 'createdAt', dir: 'desc' },
  { label: 'Oldest first', field: 'createdAt', dir: 'asc' },
  { label: 'Largest first', field: 'sizeBytes', dir: 'desc' },
  { label: 'Smallest first', field: 'sizeBytes', dir: 'asc' },
  { label: 'Type (A → Z)', field: 'mimeType', dir: 'asc' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Top toolbar with result count, debounced search, view toggle, and sort.
 */
export function FilesToolbar({
  count,
  total,
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sort,
  onSortChange,
  isLoading = false,
}: FilesToolbarProps) {
  // Internal input state so we can debounce before calling onSearchChange
  const [inputValue, setInputValue] = React.useState(search);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external search value into local state (e.g. when filters are cleared)
  React.useEffect(() => {
    setInputValue(search);
  }, [search]);

  // Debounce input → parent callback (300 ms)
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInputValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearchChange(val), 300);
  }

  // Active sort label for the dropdown display
  const activeSortLabel =
    SORT_OPTIONS.find(
      (o) => o.field === sort.field && o.dir === sort.dir,
    )?.label ?? 'Sort';

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Result count — left anchor */}
      <p className="shrink-0 text-sm text-[var(--color-text-secondary)]">
        {isLoading ? (
          // Skeleton while loading
          <span className="inline-block h-4 w-32 animate-pulse rounded bg-[var(--color-bg-secondary)]" />
        ) : (
          <>
            Showing{' '}
            <span className="font-medium text-[var(--color-text-primary)]">
              {count}
            </span>{' '}
            of{' '}
            <span className="font-medium text-[var(--color-text-primary)]">
              {total}
            </span>{' '}
            files
          </>
        )}
      </p>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search input — center/right */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-secondary)]"
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder="Search files…"
          value={inputValue}
          onChange={handleInputChange}
          disabled={isLoading}
          aria-label="Search files"
          className="h-9 w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] pl-8 pr-3 text-sm placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 sm:w-64"
        />
      </div>

      {/* Sort dropdown */}
      <div className="relative">
        <button
          className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]"
          aria-label="Sort files"
          aria-haspopup="listbox"
        >
          <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{activeSortLabel}</span>
        </button>
        {/* Native <select> for keyboard / screen reader accessibility */}
        <select
          value={`${sort.field}:${sort.dir}`}
          onChange={(e) => {
            const [field, dir] = e.target.value.split(':') as [SortField, SortDir];
            onSortChange({ field, dir });
          }}
          aria-label="Sort files"
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={`${o.field}:${o.dir}`} value={`${o.field}:${o.dir}`}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* View mode toggle buttons */}
      <div className="flex overflow-hidden rounded-lg border border-[var(--color-border)]">
        <button
          onClick={() => onViewModeChange('grid')}
          aria-label="Grid view"
          aria-pressed={viewMode === 'grid'}
          className={cn(
            'flex h-9 w-9 items-center justify-center transition-colors',
            viewMode === 'grid'
              ? 'bg-blue-500 text-white'
              : 'bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]',
          )}
        >
          <LayoutGrid className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          onClick={() => onViewModeChange('list')}
          aria-label="List view"
          aria-pressed={viewMode === 'list'}
          className={cn(
            'flex h-9 w-9 items-center justify-center border-l border-[var(--color-border)] transition-colors',
            viewMode === 'list'
              ? 'bg-blue-500 text-white'
              : 'bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]',
          )}
        >
          <List className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
