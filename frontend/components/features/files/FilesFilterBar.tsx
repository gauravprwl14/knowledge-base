'use client';

/**
 * FilesFilterBar — search input, MIME group filter, status filter, and sort controls
 * for the Files browser page.
 */

import * as React from 'react';
import { Search, X } from 'lucide-react';
import type { MimeGroup, FileStatus, ListFilesParams } from '@/lib/api/files';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'largest' | 'smallest';

export interface FilesFilterState {
  search: string;
  mimeGroup: MimeGroup | '';
  status: FileStatus | '';
  sort: SortOption;
}

interface FilesFilterBarProps {
  filters: FilesFilterState;
  onChange: (next: FilesFilterState) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIME_GROUPS: { label: string; value: MimeGroup | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Documents', value: 'document' },
  { label: 'Images', value: 'image' },
  { label: 'Audio', value: 'audio' },
  { label: 'Video', value: 'video' },
  { label: 'Spreadsheets', value: 'spreadsheet' },
];

const STATUS_OPTIONS: { label: string; value: FileStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Indexed', value: 'INDEXED' },
  { label: 'Processing', value: 'PROCESSING' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Error', value: 'ERROR' },
];

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Name A→Z', value: 'name-asc' },
  { label: 'Name Z→A', value: 'name-desc' },
  { label: 'Largest', value: 'largest' },
  { label: 'Smallest', value: 'smallest' },
];

/**
 * Converts the UI SortOption to ListFilesParams sortBy/sortDir.
 */
export function sortOptionToParams(sort: SortOption): Pick<ListFilesParams, 'sortBy' | 'sortDir'> {
  switch (sort) {
    case 'newest': return { sortBy: 'createdAt', sortDir: 'desc' };
    case 'oldest': return { sortBy: 'createdAt', sortDir: 'asc' };
    case 'name-asc': return { sortBy: 'name', sortDir: 'asc' };
    case 'name-desc': return { sortBy: 'name', sortDir: 'desc' };
    case 'largest': return { sortBy: 'sizeBytes', sortDir: 'desc' };
    case 'smallest': return { sortBy: 'sizeBytes', sortDir: 'asc' };
    default: return { sortBy: 'createdAt', sortDir: 'desc' };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the full filter/search bar for the Files browser.
 */
export function FilesFilterBar({ filters, onChange }: FilesFilterBarProps) {
  // Debounced search: local value updates immediately; parent is notified after 300 ms
  const [localSearch, setLocalSearch] = React.useState(filters.search);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local search in sync if parent resets it externally
  React.useEffect(() => {
    setLocalSearch(filters.search);
  }, [filters.search]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange({ ...filters, search: value });
    }, 300);
  }

  function clearSearch() {
    setLocalSearch('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onChange({ ...filters, search: '' });
  }

  function setMimeGroup(value: MimeGroup | '') {
    onChange({ ...filters, mimeGroup: value });
  }

  function setStatus(value: FileStatus | '') {
    onChange({ ...filters, status: value });
  }

  function setSort(value: SortOption) {
    onChange({ ...filters, sort: value });
  }

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="files-filter-bar">
      {/* Row 1: search + sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search input */}
        <div className="relative flex-1 min-w-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={localSearch}
            onChange={handleSearchChange}
            placeholder="Search files…"
            aria-label="Search files"
            data-testid="search-input"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-8 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#a78bfa]/50 transition-colors"
          />
          {localSearch && (
            <button
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Sort select */}
        <select
          value={filters.sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          aria-label="Sort files"
          data-testid="sort-select"
          className="rounded-lg border border-white/10 bg-white/5 py-2 px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#a78bfa]/50 transition-colors cursor-pointer min-w-[140px]"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#13131f] text-slate-200">
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Row 2: MIME group + status filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* MIME group pills */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by file type">
          {MIME_GROUPS.map((group) => (
            <button
              key={group.value}
              onClick={() => setMimeGroup(group.value)}
              data-testid={`mime-filter-${group.value || 'all'}`}
              aria-pressed={filters.mimeGroup === group.value}
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filters.mimeGroup === group.value
                  ? 'bg-[#a78bfa]/20 text-[#a78bfa] border border-[#a78bfa]/40'
                  : 'border border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20',
              ].join(' ')}
            >
              {group.label}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-white/10 hidden sm:block" aria-hidden="true" />

        {/* Status pills */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              data-testid={`status-filter-${opt.value || 'all'}`}
              aria-pressed={filters.status === opt.value}
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filters.status === opt.value
                  ? 'bg-[#93c5fd]/20 text-[#93c5fd] border border-[#93c5fd]/40'
                  : 'border border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
