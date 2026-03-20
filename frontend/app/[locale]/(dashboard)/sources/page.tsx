'use client';

import * as React from 'react';
import { kmsSourcesApi, type KmsSource, type SourceStatus, type SourceType } from '@/lib/api/sources';
import { Skeleton } from '@/components/ui/skeleton';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadgeClass(status: SourceStatus): string {
  switch (status) {
    case 'CONNECTED':
    case 'COMPLETED':
      return 'bg-green-100 text-green-800';
    case 'SCANNING':
      return 'bg-blue-100 text-blue-800';
    case 'ERROR':
      return 'bg-red-100 text-red-800';
    case 'EXPIRED':
    case 'DISCONNECTED':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-yellow-100 text-yellow-800';
  }
}

function typeBadgeClass(type: SourceType): string {
  switch (type) {
    case 'GOOGLE_DRIVE':
      return 'bg-blue-50 text-blue-700';
    case 'OBSIDIAN':
      return 'bg-purple-50 text-purple-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SourceCard({
  source,
  onDisconnect,
  disconnecting,
}: {
  source: KmsSource;
  onDisconnect: (id: string) => void;
  disconnecting: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 shadow-sm flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-[var(--color-text-primary)] truncate max-w-xs">
            {source.displayName ?? source.id}
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeClass(source.type)}`}
            >
              {source.type.replace('_', ' ')}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(source.status)}`}
            >
              {source.status}
            </span>
          </div>
        </div>
        <button
          onClick={() => onDisconnect(source.id)}
          disabled={disconnecting}
          className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          Disconnect
        </button>
      </div>
      <p className="text-xs text-[var(--color-text-secondary)]">
        Last synced: {formatDate(source.lastSyncedAt)}
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SourcesPage() {
  const [sources, setSources] = React.useState<KmsSource[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = React.useState<string | null>(null);

  const loadSources = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await kmsSourcesApi.list();
      setSources(data);
    } catch {
      setError('Failed to load sources. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadSources();
  }, [loadSources]);

  const handleDisconnect = async (id: string) => {
    setDisconnectingId(id);
    try {
      await kmsSourcesApi.disconnect(id);
      setSources((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setError('Failed to disconnect source. Please try again.');
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleConnectGoogleDrive = () => {
    window.location.href = '/kms/api/v1/sources/google-drive/oauth';
  };

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-h2 font-bold text-[var(--color-text-primary)]">Sources</h1>
          <p className="mt-1 text-body-lg text-[var(--color-text-secondary)]">
            Manage your connected knowledge sources.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleConnectGoogleDrive}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Connect Google Drive
          </button>
          <button
            disabled
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] opacity-50 cursor-not-allowed"
          >
            Add Local Source
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={loadSources}
            className="mt-3 text-sm font-medium text-red-700 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      ) : sources.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <p className="text-[var(--color-text-secondary)]">No sources connected yet.</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Connect Google Drive or add a local source to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              onDisconnect={handleDisconnect}
              disconnecting={disconnectingId === source.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
