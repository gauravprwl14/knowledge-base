'use client';

/**
 * FilesTable — table view alternative for the Files browser.
 * Renders files as rows with checkboxes, icon, name, type, size, embedding status, and delete action.
 */

import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { FileTypeIcon } from '@/components/features/drive/FileTypeIcon';
import type { KmsFile } from '@/lib/api/files';
import { formatBytes, formatDate } from './FileCard';
import { EmbeddingStatusBadge } from './EmbeddingStatusBadge';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface FilesTableProps {
  files: KmsFile[];
  selectedIds: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onDelete: (id: string) => Promise<void>;
}

/**
 * Renders the file list in a compact table layout.
 */
export function FilesTable({ files, selectedIds, onSelect, onSelectAll, onDelete }: FilesTableProps) {
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const allSelected = files.length > 0 && files.every((f) => selectedIds.has(f.id));

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden" data-testid="files-table">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.03] border-b border-white/10">
          <tr>
            <th className="px-4 py-3 w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onSelectAll(e.target.checked)}
                aria-label="Select all files"
                className="h-4 w-4 rounded border-white/20 bg-white/10 accent-[#a78bfa] cursor-pointer"
              />
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide hidden sm:table-cell">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide hidden md:table-cell">
              Size
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide hidden lg:table-cell">
              Indexed
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">
              Status
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {files.map((file) => {
            const isDeleting = deletingId === file.id;
            const isSelected = selectedIds.has(file.id);
            return (
              <tr
                key={file.id}
                data-testid="file-row"
                className={[
                  'transition-colors',
                  isSelected ? 'bg-[#a78bfa]/5' : 'hover:bg-white/[0.03]',
                  isDeleting ? 'opacity-50 pointer-events-none' : '',
                ].join(' ')}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(file.id, e.target.checked)}
                    aria-label={`Select ${file.name}`}
                    data-testid={`checkbox-${file.id}`}
                    className="h-4 w-4 rounded border-white/20 bg-white/10 accent-[#a78bfa] cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileTypeIcon mimeType={file.mimeType} className="h-4 w-4 shrink-0" />
                    <span
                      className="truncate max-w-[180px] text-slate-200 font-medium"
                      title={file.name}
                    >
                      {file.name}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-slate-500 text-xs">
                  {file.mimeType.split('/')[1]?.toUpperCase() ?? file.mimeType}
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-slate-500 text-xs">
                  {formatBytes(file.sizeBytes)}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-slate-500 text-xs">
                  {formatDate(file.indexedAt)}
                </td>
                <td className="px-4 py-3">
                  {file.embeddingStatus ? (
                    <EmbeddingStatusBadge status={file.embeddingStatus} />
                  ) : (
                    <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-slate-500/15 text-slate-400">
                      {file.status}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(file.id)}
                    disabled={isDeleting}
                    aria-label={`Delete ${file.name}`}
                    data-testid={`delete-btn-${file.id}`}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {isDeleting ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
