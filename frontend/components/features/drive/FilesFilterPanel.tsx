'use client';

/**
 * FilesFilterPanel — collapsible left-sidebar with all filter dimensions.
 *
 * Sections:
 *  1. Sources    — radio group from useSources()
 *  2. File Type  — checkboxes for MIME groups
 *  3. Status     — checkboxes for processing status
 *  4. Collections— list from useCollections()
 *  5. Tags       — tag chips with counts from useTags()
 *
 * Each section is independently collapsible via a chevron toggle.
 * "Clear All Filters" button at the bottom resets everything.
 */

import * as React from 'react';
import { ChevronDown, ChevronRight, Tag } from 'lucide-react';
import { useSources } from '@/lib/hooks/use-sources';
import { useCollections } from '@/lib/hooks/use-collections';
import { useTags } from '@/lib/hooks/use-files';
import { cn } from '@/lib/utils';
import type { MimeGroup, FileStatus } from '@/lib/api/files';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActiveFilters {
  sourceId?: string;
  mimeGroup?: MimeGroup;
  statuses: FileStatus[];
  collectionId?: string;
  tags: string[];
}

export interface FilesFilterPanelProps {
  filters: ActiveFilters;
  onChange: (filters: ActiveFilters) => void;
}

// ---------------------------------------------------------------------------
// Static filter options
// ---------------------------------------------------------------------------

const MIME_GROUPS: { label: string; value: MimeGroup }[] = [
  { label: 'Document', value: 'document' },
  { label: 'Image', value: 'image' },
  { label: 'Audio', value: 'audio' },
  { label: 'Video', value: 'video' },
  { label: 'Spreadsheet', value: 'spreadsheet' },
  { label: 'Other', value: 'other' },
];

const STATUS_OPTIONS: { label: string; value: FileStatus }[] = [
  { label: 'Indexed', value: 'INDEXED' },
  { label: 'Processing', value: 'PROCESSING' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Error', value: 'ERROR' },
];

// ---------------------------------------------------------------------------
// Collapsible section wrapper
// ---------------------------------------------------------------------------

interface FilterSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function FilterSection({ title, children, defaultOpen = true }: FilterSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="border-b border-[var(--color-border)] py-3">
      {/* Section header with toggle chevron */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-semibold text-[var(--color-text-primary)]"
        aria-expanded={open}
      >
        {title}
        {open ? (
          <ChevronDown className="h-4 w-4 text-[var(--color-text-secondary)]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--color-text-secondary)]" />
        )}
      </button>
      {/* Collapsible content */}
      {open && <div className="mt-2 space-y-1">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton for loading states inside panel
// ---------------------------------------------------------------------------

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-4 w-full animate-pulse rounded bg-[var(--color-bg-secondary)]"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel component
// ---------------------------------------------------------------------------

/**
 * Left sidebar with collapsible filter sections.
 * Calls onChange with a full new filters object on every interaction.
 */
export function FilesFilterPanel({ filters, onChange }: FilesFilterPanelProps) {
  // Fetch sources, collections, and tags for dynamic sections
  const { data: sources, isLoading: sourcesLoading } = useSources();
  const { data: collections, isLoading: collectionsLoading } = useCollections();
  const { data: tags, isLoading: tagsLoading } = useTags();

  /** Helper — merges a partial update into the current filters object */
  function update(patch: Partial<ActiveFilters>) {
    onChange({ ...filters, ...patch });
  }

  /** Toggle a value in an array filter (status or tag name) */
  function toggleArray<T>(array: T[], value: T): T[] {
    return array.includes(value)
      ? array.filter((v) => v !== value)
      : [...array, value];
  }

  /** True if any filter is active */
  const hasActiveFilters =
    !!filters.sourceId ||
    !!filters.mimeGroup ||
    filters.statuses.length > 0 ||
    !!filters.collectionId ||
    filters.tags.length > 0;

  return (
    <aside
      aria-label="File filters"
      className="flex w-56 shrink-0 flex-col"
    >
      {/* Panel heading */}
      <div className="flex items-center justify-between pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Filters</h2>
        {/* Clear button — only shown when filters are active */}
        {hasActiveFilters && (
          <button
            onClick={() =>
              onChange({ sourceId: undefined, mimeGroup: undefined, statuses: [], collectionId: undefined, tags: [] })
            }
            className="text-xs text-blue-500 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1: Sources                                                  */}
      {/* ------------------------------------------------------------------ */}
      <FilterSection title="Sources">
        {sourcesLoading ? (
          <SkeletonRows count={3} />
        ) : !sources?.length ? (
          <p className="text-xs text-[var(--color-text-secondary)]">No sources connected</p>
        ) : (
          <>
            {/* "All sources" radio */}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-primary)]">
              <input
                type="radio"
                name="source"
                checked={!filters.sourceId}
                onChange={() => update({ sourceId: undefined })}
                className="accent-blue-500"
              />
              All sources
            </label>
            {sources
              .filter((s) => s.status !== 'DISCONNECTED')
              .map((source) => (
                <label
                  key={source.id}
                  className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-primary)]"
                >
                  <input
                    type="radio"
                    name="source"
                    checked={filters.sourceId === source.id}
                    onChange={() => update({ sourceId: source.id })}
                    className="accent-blue-500"
                  />
                  {source.displayName ?? source.type}
                </label>
              ))}
          </>
        )}
      </FilterSection>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2: File Type                                                */}
      {/* ------------------------------------------------------------------ */}
      <FilterSection title="File Type">
        {/* "All types" clears the mime group filter */}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-primary)]">
          <input
            type="radio"
            name="mimeGroup"
            checked={!filters.mimeGroup}
            onChange={() => update({ mimeGroup: undefined })}
            className="accent-blue-500"
          />
          All types
        </label>
        {MIME_GROUPS.map((g) => (
          <label
            key={g.value}
            className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-primary)]"
          >
            <input
              type="radio"
              name="mimeGroup"
              checked={filters.mimeGroup === g.value}
              onChange={() => update({ mimeGroup: g.value })}
              className="accent-blue-500"
            />
            {g.label}
          </label>
        ))}
      </FilterSection>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3: Status                                                   */}
      {/* ------------------------------------------------------------------ */}
      <FilterSection title="Status">
        {STATUS_OPTIONS.map((s) => (
          <label
            key={s.value}
            className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-primary)]"
          >
            <input
              type="checkbox"
              checked={filters.statuses.includes(s.value)}
              onChange={() =>
                update({ statuses: toggleArray(filters.statuses, s.value) })
              }
              className="rounded accent-blue-500"
            />
            {s.label}
          </label>
        ))}
      </FilterSection>

      {/* ------------------------------------------------------------------ */}
      {/* Section 4: Collections                                              */}
      {/* ------------------------------------------------------------------ */}
      <FilterSection title="Collections" defaultOpen={false}>
        {collectionsLoading ? (
          <SkeletonRows count={3} />
        ) : !collections?.length ? (
          <p className="text-xs text-[var(--color-text-secondary)]">No collections yet</p>
        ) : (
          <>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-primary)]">
              <input
                type="radio"
                name="collection"
                checked={!filters.collectionId}
                onChange={() => update({ collectionId: undefined })}
                className="accent-blue-500"
              />
              All collections
            </label>
            {collections.map((col) => (
              <label
                key={col.id}
                className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-primary)]"
              >
                <input
                  type="radio"
                  name="collection"
                  checked={filters.collectionId === col.id}
                  onChange={() => update({ collectionId: col.id })}
                  className="accent-blue-500"
                />
                <span className="truncate" title={col.name}>
                  {col.name}
                </span>
                <span className="ml-auto text-xs text-[var(--color-text-secondary)]">
                  {col.fileCount}
                </span>
              </label>
            ))}
          </>
        )}
      </FilterSection>

      {/* ------------------------------------------------------------------ */}
      {/* Section 5: Tags                                                     */}
      {/* ------------------------------------------------------------------ */}
      <FilterSection title="Tags" defaultOpen={false}>
        {tagsLoading ? (
          <SkeletonRows count={4} />
        ) : !tags?.length ? (
          <p className="text-xs text-[var(--color-text-secondary)]">No tags yet</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const isActive = filters.tags.includes(tag.name);
              return (
                <button
                  key={tag.id}
                  onClick={() =>
                    update({ tags: toggleArray(filters.tags, tag.name) })
                  }
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
                    isActive
                      ? 'border-transparent text-white'
                      : 'border-[var(--color-border)] text-[var(--color-text-primary)] hover:border-transparent hover:text-white',
                  )}
                  style={
                    isActive
                      ? { backgroundColor: tag.color }
                      : { '--tag-color': tag.color } as React.CSSProperties
                  }
                  title={`${tag.fileCount} files`}
                >
                  {/* Colored dot */}
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                  <span className="opacity-60">({tag.fileCount})</span>
                </button>
              );
            })}
          </div>
        )}
        {/* Manage Tags link */}
        <a
          href="/tags"
          className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:underline"
        >
          <Tag className="h-3 w-3" />
          Manage Tags
        </a>
      </FilterSection>
    </aside>
  );
}
