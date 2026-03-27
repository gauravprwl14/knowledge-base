'use client';

/**
 * ApiKeyListItem — pure UI component for a single API key row.
 *
 * Receives data + callbacks via props — no API calls, no store access.
 * Shows a confirm dialog before revoking.
 */

import { useState } from 'react';
import { Trash2, Clock, Key, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiKey } from '@/lib/types/auth.types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ApiKeyListItemProps {
  apiKey: ApiKey;
  onRevoke: (id: string) => void;
  isRevoking: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Confirm dialog (inline — no external dependency)
// ---------------------------------------------------------------------------

interface ConfirmDialogProps {
  keyName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isRevoking: boolean;
}

function ConfirmDialog({ keyName, onConfirm, onCancel, isRevoking }: ConfirmDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="revoke-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
        <h3
          id="revoke-dialog-title"
          className="text-base font-semibold text-[var(--color-text-primary)] mb-2"
        >
          Revoke API key?
        </h3>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6 leading-relaxed">
          This will permanently revoke{' '}
          <span className="font-medium text-[var(--color-text-primary)]">
            &ldquo;{keyName}&rdquo;
          </span>
          . Any applications using this key will lose access immediately. This
          action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isRevoking}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isRevoking}
            aria-busy={isRevoking}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--color-status-error)] text-white hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {isRevoking ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Revoking…
              </>
            ) : (
              'Revoke key'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ApiKeyListItem({ apiKey, onRevoke, isRevoking }: ApiKeyListItemProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRevokeClick = () => setShowConfirm(true);
  const handleConfirm = () => {
    onRevoke(apiKey.id);
    setShowConfirm(false);
  };
  const handleCancel = () => setShowConfirm(false);

  const isExpired =
    apiKey.expiresAt ? new Date(apiKey.expiresAt) < new Date() : false;

  return (
    <>
      <div className="flex items-center gap-4 px-5 py-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)] transition-colors">
        {/* Key icon */}
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-bg-secondary)] shrink-0">
          <Key className="w-4 h-4 text-[var(--color-text-muted)]" aria-hidden="true" />
        </div>

        {/* Key info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {apiKey.name}
            </p>
            {isExpired && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-[var(--color-status-error-bg)] text-[var(--color-status-error)]">
                Expired
              </span>
            )}
          </div>

          {/* Key prefix */}
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)] font-mono">
            {apiKey.prefix}•••••••••••••••••
          </p>

          {/* Metadata row */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
              Created {formatDate(apiKey.createdAt)}
            </span>
            {apiKey.expiresAt && (
              <span className={cn('flex items-center gap-1', isExpired && 'text-[var(--color-status-error)]')}>
                Expires {formatDate(apiKey.expiresAt)}
              </span>
            )}
            {apiKey.lastUsedAt && (
              <span className="flex items-center gap-1">
                Last used {formatDate(apiKey.lastUsedAt)}
              </span>
            )}
            {!apiKey.lastUsedAt && (
              <span className="text-[var(--color-text-muted)]">Never used</span>
            )}
          </div>
        </div>

        {/* Revoke button */}
        <button
          type="button"
          onClick={handleRevokeClick}
          disabled={isRevoking}
          aria-label={`Revoke API key "${apiKey.name}"`}
          className={cn(
            'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            'border border-[var(--color-status-error)]/30 text-[var(--color-status-error)]',
            'hover:bg-[var(--color-status-error-bg)] hover:border-[var(--color-status-error)]/50',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {isRevoking ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Trash2 className="w-3 h-3" aria-hidden="true" />
          )}
          Revoke
        </button>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <ConfirmDialog
          keyName={apiKey.name}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isRevoking={isRevoking}
        />
      )}
    </>
  );
}
