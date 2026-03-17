'use client';

/**
 * ApiKeysFeature — wires API key hooks to the UI components.
 *
 * Responsibilities:
 * - Fetches the list of API keys via useApiKeys()
 * - Manages modal open/close state
 * - Passes the created key to the modal for the one-time display
 * - Clears the created key when the modal is closed
 */

import { useState, useCallback } from 'react';
import { Plus, Key, AlertCircle, Loader2 } from 'lucide-react';
import { ApiKeyListItem } from './ApiKeyListItem';
import { CreateApiKeyModal } from './CreateApiKeyModal';
import { useApiKeys } from '@/lib/hooks/auth/use-api-keys';
import { useCreateApiKey } from '@/lib/hooks/auth/use-api-keys';
import { useRevokeApiKey } from '@/lib/hooks/auth/use-api-keys';
import type { CreateApiKeyRequest } from '@/lib/types/auth.types';

export function ApiKeysFeature() {
  const [modalOpen, setModalOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const { apiKeys, isLoading, isError, error } = useApiKeys();
  const {
    createApiKey,
    isPending: isCreating,
    error: createError,
  } = useCreateApiKey();
  const {
    revokeApiKey,
    isPending: isRevoking,
    revokingId,
  } = useRevokeApiKey();

  const handleOpenModal = () => {
    setCreatedKey(null);
    setModalOpen(true);
  };

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setCreatedKey(null);
  }, []);

  const handleCreateKey = useCallback(
    async (data: CreateApiKeyRequest) => {
      try {
        const result = await createApiKey(data);
        setCreatedKey(result.key);
      } catch {
        // Error is surfaced via createError from the hook
      }
    },
    [createApiKey],
  );

  const handleRevoke = useCallback(
    async (id: string) => {
      try {
        await revokeApiKey(id);
      } catch {
        // Error is surfaced via the hook — could add a toast here
      }
    },
    [revokeApiKey],
  );

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            API keys allow external applications to authenticate with the KMS
            API on your behalf.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenModal}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          New key
        </button>
      </div>

      {/* Create error */}
      {createError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-[var(--color-status-error-bg)] border border-[var(--color-status-error)]/20"
        >
          <AlertCircle
            className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-status-error)]"
            aria-hidden="true"
          />
          <p className="text-sm text-[var(--color-status-error)]">{createError}</p>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2
            className="w-6 h-6 animate-spin text-[var(--color-text-muted)]"
            aria-label="Loading API keys"
          />
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-[var(--color-status-error-bg)] border border-[var(--color-status-error)]/20"
        >
          <AlertCircle
            className="w-4 h-4 shrink-0 text-[var(--color-status-error)]"
            aria-hidden="true"
          />
          <p className="text-sm text-[var(--color-status-error)]">
            {error ?? 'Failed to load API keys. Please refresh.'}
          </p>
        </div>
      ) : apiKeys.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center gap-3 py-14 rounded-xl border border-dashed border-[var(--color-border)] text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-bg-secondary)]">
            <Key
              className="w-5 h-5 text-[var(--color-text-muted)]"
              aria-hidden="true"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">
              No API keys yet
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Create your first key to integrate external applications
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenModal}
            className="mt-1 text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors font-medium"
          >
            Create API key
          </button>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Your API keys">
          {apiKeys.map((key) => (
            <li key={key.id}>
              <ApiKeyListItem
                apiKey={key}
                onRevoke={handleRevoke}
                isRevoking={isRevoking && revokingId === key.id}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Modal */}
      <CreateApiKeyModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        onSubmit={handleCreateKey}
        isLoading={isCreating}
        createdKey={createdKey}
      />
    </div>
  );
}
