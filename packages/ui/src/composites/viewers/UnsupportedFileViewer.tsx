import * as React from 'react';
import { FileX2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Text } from '../../primitives/Text';
import { Stack } from '../../primitives/Stack';
import { Icon } from '../../primitives/Icon';
import { Button } from '../../primitives/Button';
import type { ViewerProps } from './types';

/**
 * UnsupportedFileViewer — fallback renderer for MIME types not in the registry.
 *
 * Shows the filename, MIME type, and action links (download, view externally).
 * This component is the safety net: every unknown file type lands here rather
 * than showing a blank screen.
 *
 * Design intent:
 *  - Always render something meaningful, never a blank viewport.
 *  - Give the user two escape hatches: download the raw file or open it
 *    in the source system (e.g. Google Drive) if a web view link is available.
 *  - The `artifact` mode gets slightly tighter padding to fit the chat panel.
 */
export const UnsupportedFileViewer: React.FC<ViewerProps> = ({
  file,
  mode,
  className,
}) => {
  return (
    <div
      data-testid="unsupported-viewer"
      className={cn(
        // Base: vertically centered card layout with generous padding
        'flex flex-col items-center justify-center gap-6 p-8 text-center',
        // Artifact mode: tighter layout to fit the chat side panel
        mode === 'artifact' && 'p-4 gap-4',
        className
      )}
    >
      {/* Icon container — slate circle provides a neutral backdrop */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800">
        <Icon icon={FileX2} size="xl" className="text-slate-400" aria-hidden />
      </div>

      {/* Explanation text block — heading + filename + MIME type */}
      <Stack gap={2} align="center">
        <Text variant="heading" size="sm">
          Preview not available
        </Text>

        {/* Filename — users need to confirm which file they opened */}
        <Text variant="muted" size="sm">
          {file.filename}
        </Text>

        {/* MIME type — shown at xs so it doesn't compete visually with the filename */}
        <Text variant="muted" size="xs">
          {file.mimeType}
        </Text>
      </Stack>

      {/* Action row — download is always shown; "View externally" only when link is available */}
      <Stack direction="row" gap={3}>
        {/*
         * Download link — uses the native `download` attribute so the browser
         * triggers a file-save dialog instead of opening the URL in a new tab.
         * `target="_blank"` is kept as a fallback for browsers that ignore `download`
         * on cross-origin URLs (e.g. presigned S3 links).
         */}
        <Button asChild variant="outline" size="sm">
          <a
            href={file.storageUrl}
            download={file.filename}
            target="_blank"
            rel="noreferrer"
          >
            Download
          </a>
        </Button>

        {/*
         * "View externally" — only rendered when a webViewLink is present.
         * This is typically a Google Drive or SharePoint web view URL that the
         * source connector attached during ingestion.
         */}
        {file.webViewLink && (
          <Button asChild variant="ghost" size="sm">
            <a
              href={file.webViewLink}
              target="_blank"
              rel="noreferrer"
            >
              View externally
            </a>
          </Button>
        )}
      </Stack>
    </div>
  );
};

UnsupportedFileViewer.displayName = 'UnsupportedFileViewer';
