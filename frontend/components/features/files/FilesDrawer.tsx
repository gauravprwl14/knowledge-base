'use client';

/**
 * FilesDrawer — Layer 4 feature component.
 *
 * Fetches a KmsFile by ID and renders it in a slide-in side panel
 * using FileViewerShell from @kb/ui.
 *
 * Layer responsibilities:
 *   - Knows about KmsFile (domain type from lib/api/files)
 *   - Calls filesApi.get() to load the file
 *   - Adapts KmsFile → ViewerFile (the @kb/ui interface)
 *   - Mounts FileViewerShell (mode="drawer")
 *   - Provides close/ESC dismiss behaviour
 *   - Provides "Open full view" CTA → navigates to /files/:id
 *
 * @see packages/ui/src/composites/FileViewerShell.tsx for rendering logic
 * @see docs/architecture/decisions/0032-hybrid-viewer-ux.md for UX rationale
 */

import * as React from 'react';
import Link from 'next/link';
import { X, ExternalLink } from 'lucide-react';
import { FileViewerShell, Button, Spinner, Text, Stack, Icon } from '@kb/ui';
import type { ViewerFile, IconComponent } from '@kb/ui';
import { filesApi } from '@/lib/api/files';
import type { KmsFile } from '@/lib/api/files';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Adapts a KmsFile (frontend domain type) to a ViewerFile (@kb/ui interface).
 *
 * KmsFile uses `name` and `path`; ViewerFile uses `filename` and `storageUrl`.
 * The metadata field is populated as an empty record since KmsFile does not
 * carry extraction pipeline metadata at the list/get level.
 *
 * @param file - The KmsFile returned by the REST API.
 * @returns A ViewerFile compatible with all @kb/ui composites.
 */
function toViewerFile(file: KmsFile): ViewerFile {
  return {
    id: file.id,
    filename: file.name,
    mimeType: file.mimeType,
    storageUrl: file.path,
    sizeBytes: file.sizeBytes,
    status: file.status,
    metadata: {},
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * FilesDrawerProps — public API for the FilesDrawer feature component.
 */
export interface FilesDrawerProps {
  /**
   * ID of the file to display. Pass `null` to close the drawer.
   * The drawer re-fetches whenever this changes to a non-null value.
   */
  fileId: string | null;
  /** Called when the user closes the drawer (Esc, backdrop click, × button) */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * FilesDrawer — slide-in file preview panel.
 *
 * Opens from the right when a file card is clicked. Fetches the file by
 * `fileId` and renders it inside `FileViewerShell` from `@kb/ui`.
 *
 * Accessibility:
 *   - Outer panel has `role="dialog"` and `aria-modal="true"`.
 *   - Close button has `aria-label="Close"` for screen reader clarity.
 *   - Escape key dismisses the drawer by attaching a `keydown` listener on
 *     `document` — works even when focus is inside the panel content.
 *
 * @example
 * const [selectedFileId, setSelectedFileId] = React.useState<string | null>(null);
 * <FilesDrawer fileId={selectedFileId} onClose={() => setSelectedFileId(null)} />
 */
export function FilesDrawer({ fileId, onClose }: FilesDrawerProps) {
  const [file, setFile] = React.useState<KmsFile | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch effect — re-runs whenever fileId changes to a non-null value.
  // The `cancelled` flag prevents state updates after unmount or on stale
  // fetches (e.g. if fileId changes quickly before the first request finishes).
  // ---------------------------------------------------------------------------
  React.useEffect(() => {
    if (!fileId) {
      // No file selected — reset state silently without triggering a fetch.
      setFile(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    filesApi
      .get(fileId)
      .then((data) => {
        if (!cancelled) {
          setFile(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // Surface the real error message from the API or the Error object.
          // Never show a generic "Something went wrong" — always propagate the
          // real message per CLAUDE.local.md Error Handling Standards.
          const message = err instanceof Error ? err.message : 'Unknown error';
          setError(`Could not load file: ${message}`);
          setLoading(false);
        }
      });

    return () => {
      // Cleanup: prevent state updates from an in-flight request if the
      // component unmounts or fileId changes before the request completes.
      cancelled = true;
    };
  }, [fileId]);

  // ---------------------------------------------------------------------------
  // Escape key handler — attached to document so it works regardless of focus.
  // Detached when fileId is null (drawer is closed) to avoid unnecessary
  // global listener overhead.
  // ---------------------------------------------------------------------------
  React.useEffect(() => {
    if (!fileId) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fileId, onClose]);

  // Drawer is closed — render nothing into the DOM.
  if (!fileId) return null;

  return (
    <>
      {/* Backdrop — clicking it closes the drawer (same as pressing Escape). */}
      <div
        className="fixed inset-0 z-[49] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={file ? `Preview: ${file.name}` : 'File preview'}
        className={cn(
          'fixed right-0 top-0 z-[50] flex h-full w-[480px] max-w-[100vw]',
          'flex-col bg-slate-900 shadow-2xl',
          'border-l border-slate-700',
        )}
      >
        {/* ----------------------------------------------------------------- */}
        {/* Header — filename (truncated) + CTA buttons                       */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <div className="min-w-0 flex-1 pr-4">
            {/*
             * Show the filename once the file has loaded. We don't show a
             * skeleton here — the filename appears in <1 s on a local API.
             */}
            {file && (
              <p className="truncate text-sm font-medium text-slate-100">
                {file.name}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/*
             * "Open full view" link — navigates to the dedicated file page.
             * Only shown after the file has loaded so the href is populated.
             * Uses Button asChild so the Link gets button styling without
             * nesting a <button> inside an <a> (invalid HTML).
             */}
            {file && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/files/${file.id}`}>
                  {/* Cast needed: monorepo dual @types/react instances cause structural mismatch */}
                  <Icon icon={ExternalLink as unknown as IconComponent} size="sm" />
                  Open full view
                </Link>
              </Button>
            )}

            {/*
             * Close button — always visible so the user can dismiss the drawer
             * even while loading or in an error state.
             */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
            >
              {/* Cast needed: monorepo dual @types/react instances cause structural mismatch */}
              <Icon icon={X as unknown as IconComponent} size="sm" />
            </Button>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Content area — loading / error / viewer states                    */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex-1 overflow-auto">
          {/*
           * Loading state — spinner centred in the content area.
           * Uses @kb/ui Spinner which has role="status" built in for a11y.
           */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              {/* Spinner has a built-in role="status" aria-label="Loading" */}
              <Spinner size="md" />
            </div>
          )}

          {/*
           * Error state — shows the real error message from the API.
           * Never displays a hardcoded "Something went wrong" string.
           */}
          {error && (
            <div className="flex items-center justify-center p-8">
              <Text variant="error" size="sm">
                {error}
              </Text>
            </div>
          )}

          {/*
           * Rendered state — adapt KmsFile to ViewerFile and mount the shell.
           * Only shown when we have a file AND are not loading AND have no error.
           */}
          {file && !loading && !error && (
            <div className="p-4">
              <FileViewerShell
                file={toViewerFile(file)}
                mode="drawer"
                onClose={onClose}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
