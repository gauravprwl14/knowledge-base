'use client';
import * as React from 'react';
import { BookOpen } from 'lucide-react';
import { useSources, useDisconnectSource, useTriggerScan } from '@/lib/hooks/use-sources';
import { useFeatureFlags } from '@/lib/hooks/use-feature-flags';
import { useCurrentUser } from '@/lib/stores/auth.store';
import { SourceCard } from './SourceCard';
import { ConnectDriveButton } from './ConnectDriveButton';
import { ConnectObsidianButton } from './ConnectObsidianButton';
import { ConnectLocalFolderButton } from './ConnectLocalFolderButton';
import type { KmsSource } from '@/lib/api/sources';

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({
  googleDriveEnabled,
  userId,
}: {
  googleDriveEnabled: boolean;
  userId: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-8 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-bg-primary)]">
        <BookOpen className="h-8 w-8 text-[var(--color-text-secondary)]" aria-hidden="true" />
      </div>

      <div className="space-y-1">
        <p className="text-lg font-semibold text-[var(--color-text-primary)]">
          No sources connected yet
        </p>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Connect your Obsidian vault or Google Drive to start indexing your documents.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <ConnectObsidianButton />
        <ConnectDriveButton userId={userId} enabled={googleDriveEnabled} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connect a new source section
// ---------------------------------------------------------------------------

function ConnectNewSource({
  googleDriveEnabled,
  userId,
}: {
  googleDriveEnabled: boolean;
  userId: string;
}) {
  return (
    <section aria-labelledby="connect-source-heading">
      <h2
        id="connect-source-heading"
        className="mb-4 text-base font-semibold text-[var(--color-text-primary)]"
      >
        Connect a New Source
      </h2>

      <div className="flex flex-wrap gap-3">
        <ConnectObsidianButton />
        <ConnectLocalFolderButton />
        <ConnectDriveButton userId={userId} enabled={googleDriveEnabled} />
      </div>

      {!googleDriveEnabled && (
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          Google Drive integration is coming soon.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

/**
 * DriveSourcesClient — renders the Sources page content.
 *
 * Shows all connected source types (Google Drive, Obsidian, Local) and
 * provides controls to connect new sources, trigger scans, and disconnect.
 */
export function DriveSourcesClient() {
  const flags = useFeatureFlags();
  const { data: sources, isLoading, isError } = useSources();
  const { mutate: disconnect, isPending: isDisconnecting, variables: disconnectingId } =
    useDisconnectSource();
  const { mutate: triggerScan, isPending: isScanPending, variables: scanVariables } =
    useTriggerScan();
  const user = useCurrentUser();

  const userId = user?.id ?? '';

  /** All active (non-disconnected) sources regardless of type. */
  const activeSources: KmsSource[] = React.useMemo(
    () => (sources ?? []).filter((s) => s.status !== 'DISCONNECTED'),
    [sources],
  );

  const hasSources = activeSources.length > 0;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-h2 font-bold text-[var(--color-text-primary)]">Sources</h1>
        <p className="mt-1 text-body-lg text-[var(--color-text-secondary)]">
          Manage your connected knowledge sources.
        </p>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-xl bg-[var(--color-bg-secondary)]"
              aria-hidden="true"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <p className="text-sm text-[var(--color-text-danger)]">
          Failed to load sources. Please refresh the page.
        </p>
      )}

      {/* Sources list */}
      {!isLoading && !isError && hasSources && (
        <section aria-labelledby="connected-sources-heading">
          <h2
            id="connected-sources-heading"
            className="mb-4 text-base font-semibold text-[var(--color-text-primary)]"
          >
            Your Connected Sources
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeSources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                onDisconnect={(id) => disconnect(id)}
                isDisconnecting={isDisconnecting && disconnectingId === source.id}
                onScan={(sourceId, scanType) => triggerScan({ sourceId, scanType })}
                isScanning={
                  isScanPending && scanVariables?.sourceId === source.id
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!isLoading && !isError && !hasSources && (
        <EmptyState googleDriveEnabled={flags.googleDrive} userId={userId} />
      )}

      {/* Connect new source section — always shown when sources exist */}
      {!isLoading && !isError && hasSources && (
        <ConnectNewSource googleDriveEnabled={flags.googleDrive} userId={userId} />
      )}
    </div>
  );
}
