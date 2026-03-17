'use client';
import * as React from 'react';
import { HardDrive } from 'lucide-react';
import { useSources, useDisconnectSource } from '@/lib/hooks/use-sources';
import { useFeatureFlags } from '@/lib/hooks/use-feature-flags';
import { useCurrentUser } from '@/lib/stores/auth.store';
import { SourceCard } from './SourceCard';
import { ConnectDriveButton } from './ConnectDriveButton';
import type { KmsSource } from '@/lib/api/sources';

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ googleDriveEnabled, userId }: { googleDriveEnabled: boolean; userId: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-8 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-bg-primary)]">
        <HardDrive className="h-8 w-8 text-[var(--color-text-secondary)]" aria-hidden="true" />
      </div>

      <div className="space-y-1">
        <p className="text-lg font-semibold text-[var(--color-text-primary)]">No sources connected</p>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Connect a Google Drive account to start indexing your files.
        </p>
      </div>

      <ConnectDriveButton userId={userId} enabled={googleDriveEnabled} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

/**
 * DriveSourcesClient — renders the Drive sources page content.
 * This is a client component so it can use TanStack Query hooks.
 */
export function DriveSourcesClient() {
  const flags = useFeatureFlags();
  const { data: sources, isLoading, isError } = useSources();
  const { mutate: disconnect, isPending, variables: disconnectingId } = useDisconnectSource();
  const user = useCurrentUser();

  const userId = user?.id ?? '';

  const driveSources: KmsSource[] = React.useMemo(
    () =>
      (sources ?? []).filter(
        (s) => s.type === 'GOOGLE_DRIVE' && s.status !== 'DISCONNECTED',
      ),
    [sources],
  );

  const hasDrive = driveSources.length > 0;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 font-bold text-[var(--color-text-primary)]">Google Drive</h1>
          <p className="mt-1 text-body-lg text-[var(--color-text-secondary)]">
            Manage your connected Google Drive accounts.
          </p>
        </div>

        {/* Show connect button in header when sources exist */}
        {hasDrive && (
          <ConnectDriveButton userId={userId} enabled={flags.googleDrive} />
        )}
      </div>

      {/* Feature flag notice */}
      {!flags.googleDrive && (
        <div
          role="status"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 text-sm text-[var(--color-text-secondary)]"
        >
          Google Drive integration is coming soon. Stay tuned!
        </div>
      )}

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
      {!isLoading && !isError && hasDrive && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {driveSources.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              onDisconnect={(id) => disconnect(id)}
              isDisconnecting={isPending && disconnectingId === source.id}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && !hasDrive && (
        <EmptyState googleDriveEnabled={flags.googleDrive} userId={userId} />
      )}
    </div>
  );
}
