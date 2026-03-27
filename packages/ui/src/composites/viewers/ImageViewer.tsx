import * as React from 'react';
import { Download, ExternalLink, ImageOff } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../../primitives/Button';
import { Skeleton } from '../../primitives/Skeleton';
import { Text } from '../../primitives/Text';
import { Stack } from '../../primitives/Stack';
import { Icon } from '../../primitives/Icon';
import type { ViewerProps } from './types';

/**
 * ImageViewer — inline image renderer with zoom-on-click, download, and error handling.
 *
 * States handled:
 *  - Loading: skeleton placeholder until browser fires onLoad
 *  - Error:   shown when browser fires onError (broken URL, 403, etc.)
 *  - Rendered: image displayed with action buttons
 *
 * Zoom: clicking the image toggles a CSS scale transform.
 */
export const ImageViewer: React.FC<ViewerProps> = ({ file, mode, className }) => {
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [zoomed, setZoomed] = React.useState(false);

  const handleLoad = () => setLoaded(true);
  const handleError = () => setError(true);
  const toggleZoom = () => setZoomed((z) => !z);

  // --- Error state ---
  // Render an error panel when the browser could not load the image (broken URL, 403, etc.)
  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-4 p-8 text-center', className)}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800">
          <Icon icon={ImageOff} size="xl" className="text-slate-400" />
        </div>
        <Text variant="muted" size="sm">
          Could not load image
        </Text>
        <Button asChild variant="outline" size="sm">
          <a href={file.storageUrl} download={file.filename} target="_blank" rel="noreferrer">
            <Icon icon={Download} size="sm" />
            Download instead
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Image container — sizing is mode-dependent */}
      <div
        data-viewer-container
        className={cn(
          'relative flex items-center justify-center overflow-hidden rounded-lg bg-slate-900',
          mode === 'drawer'   && 'min-h-48 max-h-[60vh]',
          mode === 'page'     && 'min-h-64 max-h-[70vh]',
          mode === 'artifact' && 'max-h-[600px]',
          mode === 'inline'   && 'max-h-48',
        )}
      >
        {/* Loading skeleton — absolutely positioned behind the image; hidden once image has loaded */}
        {!loaded && (
          <Skeleton className="absolute inset-0 rounded-lg" />
        )}

        {/* The actual image element — opacity-0 until loaded to avoid layout flash */}
        <img
          src={file.storageUrl}
          alt={file.filename}
          onLoad={handleLoad}
          onError={handleError}
          onClick={toggleZoom}
          className={cn(
            'max-h-full max-w-full object-contain transition-transform duration-200',
            loaded ? 'opacity-100' : 'opacity-0',
            zoomed ? 'scale-150 cursor-zoom-out' : 'cursor-zoom-in',
          )}
        />
      </div>

      {/* Action bar — shown in all modes except inline (where chrome is suppressed) */}
      {mode !== 'inline' && (
        <Stack direction="row" gap={2} className="mt-3 px-1">
          {/* Download button: uses HTML download attribute to trigger file save */}
          <Button asChild variant="ghost" size="sm">
            <a href={file.storageUrl} download={file.filename} target="_blank" rel="noreferrer">
              <Icon icon={Download} size="sm" />
              Download
            </a>
          </Button>

          {/* View externally — only shown when a webViewLink (e.g. Google Drive URL) is available */}
          {file.webViewLink && (
            <Button asChild variant="ghost" size="sm">
              <a href={file.webViewLink} target="_blank" rel="noreferrer">
                <Icon icon={ExternalLink} size="sm" />
                View externally
              </a>
            </Button>
          )}
        </Stack>
      )}
    </div>
  );
};

ImageViewer.displayName = 'ImageViewer';
