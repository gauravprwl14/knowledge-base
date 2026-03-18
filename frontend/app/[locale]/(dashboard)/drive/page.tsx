<<<<<<< HEAD
/**
 * Sources page — lists all connected knowledge sources (Google Drive, Obsidian,
 * Local folders) and allows connecting new ones.
 *
 * This is a Server Component shell. All interactive content is delegated to
 * DriveSourcesClient (a Client Component) so that hooks and mutations work.
 */
import { DriveSourcesClient } from '@/components/features/sources/DriveSourcesClient';

export const metadata = {
  title: 'Sources — KMS',
  description: 'Manage your connected knowledge sources: Obsidian vaults, Google Drive, and local folders',
};

export default function SourcesPage() {
=======
'use client';

/**
 * Drive page — two-tab layout:
 *   Tab 1: "Files"   — FilesBrowser (grid/list, filters, tags, bulk actions)
 *   Tab 2: "Sources" — DriveSourcesClient (manage connected sources)
 *
 * Defaults to the "Files" tab when sources exist; falls back to "Sources"
 * when no sources are connected so the user is guided to connect one first.
 *
 * This file is a Client Component so it can read sources state and manage
 * the active tab. The heavy data-fetching happens inside the tab contents.
 */

import * as React from 'react';
import { DriveSourcesClient } from '@/components/features/sources/DriveSourcesClient';
import { FilesBrowser } from '@/components/features/drive/FilesBrowser';
import { useSources } from '@/lib/hooks/use-sources';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Tab definition
// ---------------------------------------------------------------------------

type Tab = 'files' | 'sources';

const TABS: { id: Tab; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'sources', label: 'Sources' },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DrivePage() {
  const { data: sources, isLoading: sourcesLoading } = useSources();

  // Determine default tab: show Files if at least one active source exists,
  // otherwise guide the user to connect a source first
  const hasActiveSources = React.useMemo(
    () =>
      (sources ?? []).some(
        (s) => s.status !== 'DISCONNECTED',
      ),
    [sources],
  );

  // Set initial tab once sources load
  const [tab, setTab] = React.useState<Tab | null>(null);
  React.useEffect(() => {
    if (!sourcesLoading && tab === null) {
      setTab(hasActiveSources ? 'files' : 'sources');
    }
  }, [sourcesLoading, hasActiveSources, tab]);

  // Show nothing until we know which tab to default to (avoids flash)
  const activeTab = tab ?? (hasActiveSources ? 'files' : 'sources');

>>>>>>> feat/drive-frontend
  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      {/* ------------------------------------------------------------------ */}
      {/* Page header                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <h1 className="text-h2 font-bold text-[var(--color-text-primary)]">Drive</h1>
        <p className="mt-1 text-body-lg text-[var(--color-text-secondary)]">
          Browse and manage files from your connected knowledge sources.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Pill-style tab switcher                                             */}
      {/* ------------------------------------------------------------------ */}
      <div
        role="tablist"
        aria-label="Drive sections"
        className="inline-flex gap-1 rounded-xl bg-[var(--color-bg-secondary)] p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-controls={`tabpanel-${t.id}`}
            aria-selected={activeTab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-lg px-5 py-2 text-sm font-medium transition-colors',
              activeTab === t.id
                ? 'bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tab panels                                                          */}
      {/* ------------------------------------------------------------------ */}

      {/* Files tab — full file browser */}
      <div
        id="tabpanel-files"
        role="tabpanel"
        aria-labelledby="tab-files"
        hidden={activeTab !== 'files'}
      >
        {activeTab === 'files' && <FilesBrowser />}
      </div>

      {/* Sources tab — source management */}
      <div
        id="tabpanel-sources"
        role="tabpanel"
        aria-labelledby="tab-sources"
        hidden={activeTab !== 'sources'}
      >
        {activeTab === 'sources' && <DriveSourcesClient />}
      </div>
    </div>
  );
}
