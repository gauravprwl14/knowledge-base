'use client';

/**
 * FileCard — renders a single KmsFile in grid or compact form with
 * a status badge, size, indexed date, and a three-dot action menu.
 */

import * as React from 'react';
import { MoreVertical, Trash2, RefreshCw } from 'lucide-react';
import { FileTypeIcon, getFileTypeInfo } from '@/components/features/drive/FileTypeIcon';
import type { KmsFile, FileStatus } from '@/lib/api/files';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a byte count into a human-readable string (B / KB / MB / GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Formats an ISO date string to a short, locale-independent date label.
 */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<FileStatus, string> = {
  INDEXED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  PROCESSING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PENDING: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  ERROR: 'bg-red-500/15 text-red-400 border-red-500/30',
  UNSUPPORTED: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  DELETED: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

const STATUS_LABELS: Record<FileStatus, string> = {
  INDEXED: 'Indexed',
  PROCESSING: 'Processing',
  PENDING: 'Pending',
  ERROR: 'Error',
  UNSUPPORTED: 'Unsupported',
  DELETED: 'Deleted',
};

function StatusBadge({ status }: { status: FileStatus }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        STATUS_STYLES[status],
      ].join(' ')}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Three-dot menu
// ---------------------------------------------------------------------------

interface ActionMenuProps {
  onDelete: () => void;
  onReindex: () => void;
  isDeleting: boolean;
  isReindexing: boolean;
}

function ActionMenu({ onDelete, onReindex, isDeleting, isReindexing }: ActionMenuProps) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  React.useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(false);
    onDelete();
  }

  function handleReindex(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(false);
    onReindex();
  }

  const isBusy = isDeleting || isReindexing;

  return (
    <div ref={menuRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label="File actions"
        aria-haspopup="true"
        aria-expanded={open}
        disabled={isBusy}
        className="rounded-md p-1 text-slate-500 hover:text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-40"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-white/10 bg-[#1a1a2e] shadow-xl py-1"
        >
          {/* Re-index: deletes existing chunks and re-queues the full embed pipeline */}
          <button
            role="menuitem"
            onClick={handleReindex}
            disabled={isReindexing}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isReindexing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {isReindexing ? 'Re-indexing…' : 'Re-index'}
          </button>
          <button
            role="menuitem"
            onClick={handleDelete}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/5 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete file
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// File card
// ---------------------------------------------------------------------------

export interface FileCardProps {
  file: KmsFile;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onDelete: (id: string) => Promise<void>;
  onReindex?: (id: string) => Promise<void>;
}

/**
 * Renders a single file as a glass card with checkbox, icon, metadata, and action menu.
 */
export function FileCard({ file, selected, onSelect, onDelete, onReindex }: FileCardProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isReindexing, setIsReindexing] = React.useState(false);
  const { label } = getFileTypeInfo(file.mimeType);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await onDelete(file.id);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleReindex() {
    if (!onReindex) return;
    setIsReindexing(true);
    try {
      await onReindex(file.id);
    } finally {
      setIsReindexing(false);
    }
  }

  return (
    <div
      data-testid="file-card"
      className={[
        'group relative rounded-xl border bg-white/5 p-4 flex flex-col gap-3 transition-all',
        selected
          ? 'border-[#a78bfa]/60 bg-[#a78bfa]/5'
          : 'border-white/10 hover:border-white/20 hover:bg-white/[0.07]',
        isDeleting ? 'opacity-50 pointer-events-none' : '',
      ].join(' ')}
    >
      {/* Checkbox + action menu row */}
      <div className="flex items-center justify-between">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(file.id, e.target.checked)}
          aria-label={`Select ${file.name}`}
          data-testid={`checkbox-${file.id}`}
          className="h-4 w-4 rounded border-white/20 bg-white/10 accent-[#a78bfa] cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        />
        <ActionMenu
          onDelete={handleDelete}
          onReindex={handleReindex}
          isDeleting={isDeleting}
          isReindexing={isReindexing}
        />
      </div>

      {/* File icon */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/5 border border-white/10 shrink-0">
          <FileTypeIcon mimeType={file.mimeType} className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p
            className="text-sm font-medium text-slate-100 truncate leading-tight"
            title={file.name}
          >
            {file.name}
          </p>
          <p className="text-xs text-slate-500 truncate mt-0.5">{label}</p>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <StatusBadge status={file.status} />
        <span className="text-xs text-slate-500">{formatBytes(file.sizeBytes)}</span>
      </div>

      {/* Indexed date */}
      <p className="text-xs text-slate-600">
        Indexed: {formatDate(file.indexedAt)}
      </p>

      {/* Tags */}
      {(file.tags?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1">
          {file.tags?.map((tag) => (
            <span
              key={tag.id}
              style={{ borderColor: `${tag.color}44`, color: tag.color, backgroundColor: `${tag.color}1a` }}
              className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
