import { lazy, type ComponentType } from 'react';
import type { ViewerProps } from './types';

// ---------------------------------------------------------------------------
// Lazy-load every viewer.
// React.lazy() means the viewer bundle is only downloaded when a file
// of that type is first encountered in the session — zero cost otherwise.
// ---------------------------------------------------------------------------

// Sprint 1 — available now
const ImageViewer = lazy(() =>
  import('./ImageViewer').then((m) => ({ default: m.ImageViewer }))
);
const UnsupportedFileViewer = lazy(() =>
  import('./UnsupportedFileViewer').then((m) => ({ default: m.UnsupportedFileViewer }))
);

// Sprint 2 — will be uncommented when implemented
// const VideoPlayer    = lazy(() => import('./VideoPlayer').then(m => ({ default: m.VideoPlayer })));
// const AudioPlayer    = lazy(() => import('./AudioPlayer').then(m => ({ default: m.AudioPlayer })));
// const PDFViewer      = lazy(() => import('./PDFViewer').then(m => ({ default: m.PDFViewer })));

// Sprint 3 — will be uncommented when implemented
// const CodeViewer        = lazy(() => import('./CodeViewer').then(m => ({ default: m.CodeViewer })));
// const MarkdownRenderer  = lazy(() => import('./MarkdownRenderer').then(m => ({ default: m.MarkdownRenderer })));

/**
 * MIME_REGISTRY — maps MIME type strings to their viewer component.
 *
 * This is the single authoritative list of supported file types.
 * Adding support for a new type = one line in this map + creating the viewer.
 * The FileViewerShell reads this map — no MIME conditionals anywhere else.
 *
 * @example
 * // To add WebP support (already included):
 * 'image/webp': ImageViewer,
 *
 * // To add PDF support in Sprint 2:
 * 'application/pdf': PDFViewer,
 */
export const MIME_REGISTRY: Record<string, ComponentType<ViewerProps>> = {
  // Images — all handled by ImageViewer via a native <img> tag
  'image/jpeg':    ImageViewer,
  'image/jpg':     ImageViewer,
  'image/png':     ImageViewer,
  'image/gif':     ImageViewer,
  'image/webp':    ImageViewer,
  'image/svg+xml': ImageViewer,
  'image/bmp':     ImageViewer,
  'image/tiff':    ImageViewer,
};

/**
 * getViewer — looks up the correct viewer component for a given MIME type.
 *
 * Lookup order:
 *   1. Exact match:  'image/jpeg'     → ImageViewer
 *   2. Prefix match: 'image/x-unknown' → ImageViewer (matches any 'image/*' entry)
 *   3. No match      → UnsupportedFileViewer (safe fallback, never throws)
 *
 * Why prefix matching?
 *   Source connectors sometimes produce non-standard MIME subtypes like
 *   'image/x-bmp' or 'image/x-icon'. Prefix matching lets these fall back
 *   to the correct viewer without needing an explicit entry in the registry.
 *
 * @param mimeType - The MIME type string to look up (e.g. 'image/jpeg').
 * @returns The lazy-loaded React component that should render this file type.
 */
export function getViewer(mimeType: string): ComponentType<ViewerProps> {
  // 1. Exact match — fastest path, covers the most common cases
  if (MIME_REGISTRY[mimeType]) {
    return MIME_REGISTRY[mimeType];
  }

  // 2. Prefix match — handles non-standard subtypes from external connectors
  // e.g. 'image/x-bmp' matches any registry key beginning with 'image/'
  const prefix = mimeType.split('/')[0];
  for (const [key, viewer] of Object.entries(MIME_REGISTRY)) {
    if (key.startsWith(prefix + '/')) {
      return viewer;
    }
  }

  // 3. Fallback — UnsupportedFileViewer is the safety net.
  // Every unknown MIME type lands here rather than rendering a blank screen.
  return UnsupportedFileViewer;
}
