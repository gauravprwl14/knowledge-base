import * as React from 'react';
import { getViewer } from './viewers/registry';
import { UnsupportedFileViewer } from './viewers/UnsupportedFileViewer';
import { Spinner } from '../primitives/Spinner';
import { Stack } from '../primitives/Stack';
import { Text } from '../primitives/Text';
import { Button } from '../primitives/Button';
import { cn } from '../lib/cn';
import type { ViewerFile, ViewerMode } from './viewers/types';

/**
 * FileViewerShellProps — public API for the central file dispatch component.
 */
export interface FileViewerShellProps {
  /** The file to render */
  file: ViewerFile;
  /**
   * Controls the surrounding chrome and sizing.
   * - drawer:   480px panel
   * - page:     Full viewport
   * - artifact: Chat side panel, fixed height
   * - inline:   No chrome
   */
  mode: ViewerMode;
  /** Called when the close button is clicked (used in drawer mode) */
  onClose?: () => void;
  /** Additional Tailwind classes for the outer shell */
  className?: string;
}

/**
 * ProcessingPlaceholder — shown when file.status is PENDING or PROCESSING.
 *
 * Renders a [role="status"] spinner so automated tests and screen readers can
 * detect that a file is still being processed.
 *
 * @param filename - Display name of the file being processed.
 */
function ProcessingPlaceholder({ filename }: { filename: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 p-8"
    >
      {/*
       * Spinner has its own role="status" built in — we rely on that for
       * accessibility and test queries rather than adding a duplicate on
       * the wrapper div.
       */}
      <Spinner size="lg" aria-label={`Processing ${filename}`} />
      <Text variant="muted" size="sm">
        Processing file — preview will appear when complete
      </Text>
    </div>
  );
}

/**
 * ErrorPlaceholder — shown when file.status is ERROR.
 *
 * Displays the filename in the error message and provides a download escape
 * hatch so the user can still access the file even when preview fails.
 *
 * @param file - The file that encountered a processing error.
 */
function ErrorPlaceholder({ file }: { file: ViewerFile }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      {/*
       * "Could not load" wording is matched by the test:
       *   expect(screen.getByText(/could not load/i)).toBeInTheDocument();
       */}
      <Text variant="error" size="sm">
        Could not load {file.filename}
      </Text>
      {/*
       * Download link is the escape hatch — native `download` attribute triggers
       * a file-save dialog in modern browsers. `target="_blank"` is a fallback
       * for cross-origin presigned URLs where `download` may be ignored.
       */}
      <Button asChild variant="outline" size="sm">
        <a href={file.storageUrl} download={file.filename} target="_blank" rel="noreferrer">
          Download instead
        </a>
      </Button>
    </div>
  );
}

/**
 * FileViewerShell — the single dispatch point for all file rendering.
 *
 * Reads the file's `mimeType`, looks it up via `getViewer()` from the MIME
 * registry, and mounts the resolved component inside a React.Suspense boundary
 * to handle the lazy-loaded viewer chunks gracefully.
 *
 * Status handling (short-circuits before registry lookup):
 *   - PENDING / PROCESSING → ProcessingPlaceholder (spinner + message)
 *   - ERROR                → ErrorPlaceholder (error text + download link)
 *   - UNSUPPORTED          → UnsupportedFileViewer (bypasses registry entirely)
 *   - INDEXED / DELETED    → ViewerComponent from registry (may still be UnsupportedFileViewer
 *                            if MIME type is unknown)
 *
 * @example
 * <FileViewerShell file={viewerFile} mode="drawer" onClose={closeDrawer} />
 */
export const FileViewerShell: React.FC<FileViewerShellProps> = ({
  file,
  mode,
  onClose: _onClose, // reserved for future drawer chrome — unused in Sprint 1
  className,
}) => {
  // --- Status short-circuits --- //

  // Files still being processed cannot be previewed yet.
  // Both PENDING (queued) and PROCESSING (active) show the same spinner UI.
  if (file.status === 'PENDING' || file.status === 'PROCESSING') {
    return (
      <div className={cn('w-full', className)}>
        <ProcessingPlaceholder filename={file.filename} />
      </div>
    );
  }

  // Files that failed processing show an error message and a download link.
  if (file.status === 'ERROR') {
    return (
      <div className={cn('w-full', className)}>
        <ErrorPlaceholder file={file} />
      </div>
    );
  }

  // --- Viewer resolution --- //

  // UNSUPPORTED status means the embed pipeline explicitly determined that
  // this MIME type cannot be processed. Skip the registry and go straight to
  // UnsupportedFileViewer so the user sees a clear message.
  //
  // For all other statuses (INDEXED, DELETED), run through getViewer() which
  // will return UnsupportedFileViewer anyway if the MIME type is unknown.
  const ViewerComponent =
    file.status === 'UNSUPPORTED'
      ? UnsupportedFileViewer
      : getViewer(file.mimeType);

  return (
    <div
      className={cn(
        'w-full',
        // Artifact mode: constrain height so it fits the chat side panel without
        // overflowing. Scroll is internal to the viewer.
        mode === 'artifact' && 'max-h-[600px] overflow-auto',
        className
      )}
    >
      {/*
       * Suspense boundary — catches the lazy-loaded viewer chunk while it loads.
       * The fallback is a centred spinner; Stack provides the layout without
       * introducing a new wrapper element pattern.
       */}
      <React.Suspense
        fallback={
          <Stack align="center" justify="center" className="min-h-32">
            <Spinner />
          </Stack>
        }
      >
        <ViewerComponent file={file} mode={mode} />
      </React.Suspense>
    </div>
  );
};

FileViewerShell.displayName = 'FileViewerShell';
