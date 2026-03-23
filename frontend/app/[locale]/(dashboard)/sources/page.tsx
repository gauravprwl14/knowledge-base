'use client';

import * as React from 'react';
import { FolderOpen, HardDrive, Loader2, RefreshCw } from 'lucide-react';
import { kmsSourcesApi, type KmsSource, type SourceStatus, type SourceType } from '@/lib/api/sources';
import { useCurrentUser } from '@/lib/stores/auth.store';
import { Skeleton } from '@/components/ui/skeleton';
import { DisconnectConfirmModal } from '@/components/features/sources/DisconnectConfirmModal';
import { FolderPickerModal } from '@/components/features/sources/FolderPickerModal';

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
// SourceCard
// ---------------------------------------------------------------------------

function SourceCard({
  source,
  onDisconnect,
  onConfigureFolders,
  onScan,
  isScanning,
}: {
  source: KmsSource;
  onDisconnect: (source: KmsSource) => void;
  onConfigureFolders: (source: KmsSource) => void;
  onScan: (id: string, type: 'FULL' | 'INCREMENTAL') => void;
  isScanning: boolean;
}) {
  const canScan =
    source.status === 'CONNECTED' ||
    source.status === 'IDLE' ||
    source.status === 'COMPLETED';

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 shadow-sm flex flex-col gap-3">
      {/* Top row: name + badges + disconnect */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            {source.type === 'GOOGLE_DRIVE'
              ? <HardDrive className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
              : <FolderOpen className="h-4 w-4 shrink-0 text-[var(--color-text-secondary)]" aria-hidden="true" />}
            <span className="font-semibold text-[var(--color-text-primary)] truncate max-w-[200px]">
              {source.displayName ?? source.id}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeClass(source.type)}`}>
              {source.type.replace('_', ' ')}
            </span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(source.status)}`}>
              {source.status === 'SCANNING' && (
                <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" aria-hidden="true" />
              )}
              {source.status}
            </span>
          </div>
        </div>

        {/* Disconnect button */}
        <button
          onClick={() => onDisconnect(source)}
          className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          Disconnect
        </button>
      </div>

      {/* Last synced */}
      <p className="text-xs text-[var(--color-text-secondary)]">
        Last synced: {formatDate(source.lastSyncedAt)}
      </p>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/* Scan controls */}
        {canScan && (
          <>
            <button
              onClick={() => onScan(source.id, 'FULL')}
              disabled={isScanning || source.status === 'SCANNING'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${isScanning ? 'animate-spin' : ''}`} aria-hidden="true" />
              {isScanning ? 'Scanning…' : 'Scan Now'}
            </button>
            {source.lastSyncedAt && (
              <button
                onClick={() => onScan(source.id, 'INCREMENTAL')}
                disabled={isScanning || source.status === 'SCANNING'}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-50 transition-colors"
              >
                Incremental Scan
              </button>
            )}
          </>
        )}

        {/* Folder picker — Google Drive only */}
        {source.type === 'GOOGLE_DRIVE' && source.status !== 'DISCONNECTED' && (
          <button
            onClick={() => onConfigureFolders(source)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            <FolderOpen className="h-3 w-3" aria-hidden="true" />
            Configure Folders
          </button>
        )}
      </div>
    </div>
  );
}

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
// Page
// ---------------------------------------------------------------------------

export default function SourcesPage() {
  const user = useCurrentUser();
  const [sources, setSources] = React.useState<KmsSource[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [scanningId, setScanningId] = React.useState<string | null>(null);

  // Modal state
  const [disconnectTarget, setDisconnectTarget] = React.useState<KmsSource | null>(null);
  const [folderTarget, setFolderTarget] = React.useState<KmsSource | null>(null);

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
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      window.history.replaceState({}, '', window.location.pathname);
      loadSources();
    } else if (params.get('error')) {
      setError(`Google Drive connection failed: ${params.get('error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [loadSources]);

  React.useEffect(() => {
    loadSources();
  }, [loadSources]);

  function handleDisconnectDone(sourceId: string) {
    setSources((prev) => prev.filter((s) => s.id !== sourceId));
  }

  async function handleScan(sourceId: string, scanType: 'FULL' | 'INCREMENTAL') {
    setScanningId(sourceId);
    try {
      await kmsSourcesApi.triggerScan(sourceId, scanType);
      // Optimistically flip status to SCANNING
      setSources((prev) =>
        prev.map((s) => (s.id === sourceId ? { ...s, status: 'SCANNING' as const } : s)),
      );
    } catch {
      setError('Failed to start scan. Please try again.');
    } finally {
      setScanningId(null);
    }
  }

  const handleConnectGoogleDrive = () => {
    if (!user?.id) {
      setError('Unable to initiate Google Drive connection: user not loaded yet. Please refresh.');
      return;
    }
    kmsSourcesApi.initiateGoogleDrive(user.id);
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
              onDisconnect={setDisconnectTarget}
              onConfigureFolders={setFolderTarget}
              onScan={handleScan}
              isScanning={scanningId === source.id}
            />
          ))}
        </div>
      )}

      {/* Disconnect confirmation modal */}
      {disconnectTarget && (
        <DisconnectConfirmModal
          source={disconnectTarget}
          open={Boolean(disconnectTarget)}
          onClose={() => setDisconnectTarget(null)}
          onDone={handleDisconnectDone}
        />
      )}

      {/* Folder picker modal */}
      {folderTarget && (
        <FolderPickerModal
          sourceId={folderTarget.id}
          open={Boolean(folderTarget)}
          onClose={() => setFolderTarget(null)}
          onSave={() => setFolderTarget(null)}
        />
      )}
    </div>
  );
}
