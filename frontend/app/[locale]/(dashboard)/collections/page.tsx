'use client';

import * as React from 'react';
import {
  ArrowLeft,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
  X,
  File,
} from 'lucide-react';
import { collectionsApi, type KmsCollection, type CreateCollectionPayload } from '@/lib/api/collections';
import { filesApi, type KmsFile } from '@/lib/api/files';
import { Skeleton } from '@/components/ui/skeleton';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function mimeLabel(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('audio/')) return 'Audio';
  if (mimeType.startsWith('video/')) return 'Video';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'Doc';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'Sheet';
  if (mimeType.startsWith('text/')) return 'Text';
  return 'File';
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-36 w-full rounded-xl" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collection card
// ---------------------------------------------------------------------------

interface CollectionCardProps {
  collection: KmsCollection;
  onOpen: (c: KmsCollection) => void;
  onDelete: (c: KmsCollection) => void;
  onEdit: (c: KmsCollection) => void;
}

function CollectionCard({ collection, onOpen, onDelete, onEdit }: CollectionCardProps) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmDelete(true);
  }

  function handleEditClick(e: React.MouseEvent) {
    e.stopPropagation();
    onEdit(collection);
  }

  function handleConfirm(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete(collection);
  }

  function handleCancel(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmDelete(false);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(collection)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(collection)}
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 shadow-sm flex flex-col gap-3 cursor-pointer hover:bg-[var(--color-bg-secondary)] transition-colors"
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FolderOpen className="h-4 w-4 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
          <span className="font-semibold text-[var(--color-text-primary)] truncate max-w-[180px]">
            {collection.name}
          </span>
        </div>
        <span className="shrink-0 inline-flex items-center rounded-full bg-[var(--color-accent)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-accent)]">
          {collection.fileCount} {collection.fileCount === 1 ? 'file' : 'files'}
        </span>
      </div>

      {/* Description */}
      {collection.description ? (
        <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2">
          {collection.description}
        </p>
      ) : (
        <p className="text-xs text-[var(--color-text-secondary)] italic">No description</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-[var(--color-text-secondary)]">
          Created {formatDate(collection.createdAt)}
        </p>

        {!collection.isDefault && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {confirmDelete ? (
              <span className="flex items-center gap-1">
                <span className="text-xs text-red-600 mr-1">Delete?</span>
                <button
                  onClick={handleConfirm}
                  className="rounded px-2 py-1 text-xs bg-red-500 text-white hover:bg-red-600 transition-colors"
                  aria-label="Confirm delete"
                >
                  Yes
                </button>
                <button
                  onClick={handleCancel}
                  className="rounded px-2 py-1 text-xs border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
                  aria-label="Cancel delete"
                >
                  No
                </button>
              </span>
            ) : (
              <>
                <button
                  onClick={handleEditClick}
                  className="rounded-lg p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
                  aria-label="Edit collection"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  onClick={handleDeleteClick}
                  className="rounded-lg p-1.5 text-[var(--color-text-secondary)] hover:text-red-600 hover:bg-red-50 transition-colors"
                  aria-label="Delete collection"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit modal
// ---------------------------------------------------------------------------

interface CollectionModalProps {
  initial?: Pick<KmsCollection, 'name' | 'description'>;
  onSave: (data: CreateCollectionPayload) => Promise<void>;
  onClose: () => void;
}

function CollectionModal({ initial, onSave, onClose }: CollectionModalProps) {
  const [name, setName] = React.useState(initial?.name ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), description: description.trim() || undefined });
      onClose();
    } catch {
      setError('Failed to save collection. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={initial ? 'Edit collection' : 'New collection'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {initial ? 'Edit Collection' : 'New Collection'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <p className="text-sm text-red-600 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="col-name" className="text-sm font-medium text-[var(--color-text-primary)]">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="col-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Research Papers"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-colors"
              required
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="col-desc" className="text-sm font-medium text-[var(--color-text-primary)]">
              Description <span className="text-[var(--color-text-secondary)]">(optional)</span>
            </label>
            <textarea
              id="col-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this collection contain?"
              rows={3}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none transition-colors"
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

interface DetailViewProps {
  collection: KmsCollection;
  onBack: () => void;
  onCollectionUpdated: (c: KmsCollection) => void;
}

function DetailView({ collection, onBack, onCollectionUpdated }: DetailViewProps) {
  const [files, setFiles] = React.useState<KmsFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = React.useState(true);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [isEditing, setIsEditing] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoadingFiles(true);
    setFileError(null);

    filesApi
      .list({ collectionId: collection.id, limit: 100 })
      .then((res) => {
        if (!cancelled) setFiles(res.items);
      })
      .catch(() => {
        if (!cancelled) setFileError('Failed to load files.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingFiles(false);
      });

    return () => { cancelled = true; };
  }, [collection.id]);

  async function handleRemoveFile(fileId: string) {
    setRemovingId(fileId);
    try {
      await collectionsApi.removeFile(collection.id, fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      onCollectionUpdated({ ...collection, fileCount: Math.max(0, collection.fileCount - 1) });
    } catch {
      setFileError('Failed to remove file. Please try again.');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleEditSave(data: CreateCollectionPayload) {
    const updated = await collectionsApi.update(collection.id, data);
    onCollectionUpdated(updated);
    setIsEditing(false);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors w-fit"
        aria-label="Back to collections"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Collections
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-h2 font-bold text-[var(--color-text-primary)]">{collection.name}</h1>
          {collection.description && (
            <p className="mt-1 text-body-lg text-[var(--color-text-secondary)]">
              {collection.description}
            </p>
          )}
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            {collection.fileCount} {collection.fileCount === 1 ? 'file' : 'files'} · Created {formatDate(collection.createdAt)}
          </p>
        </div>
        {!collection.isDefault && (
          <button
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </button>
        )}
      </div>

      {/* Error */}
      {fileError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700">{fileError}</p>
          <button onClick={() => setFileError(null)} className="text-xs text-red-500 hover:text-red-700">
            Dismiss
          </button>
        </div>
      )}

      {/* Files */}
      {isLoadingFiles ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <File className="mx-auto h-8 w-8 text-[var(--color-text-secondary)] mb-3" aria-hidden="true" />
          <p className="text-[var(--color-text-secondary)]">No files in this collection yet.</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Add files from the Files page.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">Name</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)] hidden sm:table-cell">Type</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)] hidden md:table-cell">Size</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--color-text-secondary)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {files.map((file) => (
                <tr key={file.id} className="bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <File className="h-4 w-4 shrink-0 text-[var(--color-text-secondary)]" aria-hidden="true" />
                      <span className="truncate max-w-[200px] text-[var(--color-text-primary)]" title={file.name}>
                        {file.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="inline-flex items-center rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">
                      {mimeLabel(file.mimeType)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)] hidden md:table-cell">
                    {formatBytes(file.sizeBytes)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRemoveFile(file.id)}
                      disabled={removingId === file.id}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                      aria-label={`Remove ${file.name} from collection`}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                      {removingId === file.id ? 'Removing…' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {isEditing && (
        <CollectionModal
          initial={{ name: collection.name, description: collection.description }}
          onSave={handleEditSave}
          onClose={() => setIsEditing(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CollectionsPage() {
  const [collections, setCollections] = React.useState<KmsCollection[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<KmsCollection | null>(null);
  const [selectedCollection, setSelectedCollection] = React.useState<KmsCollection | null>(null);

  const loadCollections = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await collectionsApi.list();
      setCollections(data);
    } catch {
      setError('Failed to load collections. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  async function handleCreate(data: CreateCollectionPayload) {
    const created = await collectionsApi.create(data);
    setCollections((prev) => [...prev, created]);
  }

  async function handleEdit(data: CreateCollectionPayload) {
    if (!editTarget) return;
    const updated = await collectionsApi.update(editTarget.id, data);
    setCollections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setEditTarget(null);
  }

  async function handleDelete(collection: KmsCollection) {
    try {
      await collectionsApi.delete(collection.id);
      setCollections((prev) => prev.filter((c) => c.id !== collection.id));
    } catch {
      setError('Failed to delete collection. Please try again.');
    }
  }

  function handleCollectionUpdated(updated: KmsCollection) {
    setCollections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    if (selectedCollection?.id === updated.id) {
      setSelectedCollection(updated);
    }
  }

  // ---------- Detail view ----------
  if (selectedCollection) {
    return (
      <div className="flex flex-col gap-6 p-6 md:p-8">
        <DetailView
          collection={selectedCollection}
          onBack={() => setSelectedCollection(null)}
          onCollectionUpdated={handleCollectionUpdated}
        />
      </div>
    );
  }

  // ---------- List view ----------
  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-h2 font-bold text-[var(--color-text-primary)]">Collections</h1>
          <p className="mt-1 text-body-lg text-[var(--color-text-secondary)]">
            Organise your files into named groups for scoped search and RAG context.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Collection
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">
            Dismiss
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : collections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-[var(--color-text-secondary)] mb-3" aria-hidden="true" />
          <p className="text-[var(--color-text-secondary)]">No collections yet.</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Create one to organise your files.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              onOpen={setSelectedCollection}
              onDelete={handleDelete}
              onEdit={setEditTarget}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <CollectionModal
          onSave={handleCreate}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Edit modal */}
      {editTarget && (
        <CollectionModal
          initial={{ name: editTarget.name, description: editTarget.description }}
          onSave={handleEdit}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
