/**
 * ViewerFile — the minimal file shape that @kb/ui composites need to render.
 *
 * This is intentionally a subset of the frontend's KmsFile type.
 * Feature components (FilesDrawer, ChatArtifactPanel) are responsible for
 * adapting their domain type to this interface before passing to FileViewerShell.
 *
 * Why a separate type?
 *   @kb/ui cannot import from frontend/lib/api/files (circular dependency).
 *   Defining a minimal interface here keeps the package self-contained.
 */
export interface ViewerFile {
  /** Unique file identifier */
  id: string;
  /** Display name of the file */
  filename: string;
  /** MIME type string (e.g. 'image/jpeg', 'application/pdf') */
  mimeType: string;
  /** Presigned URL or direct URL to the raw file content */
  storageUrl: string;
  /** File size in bytes */
  sizeBytes: number;
  /**
   * Processing status. Viewers use this to decide whether to show
   * the ProcessingStatus composite instead of the rendered content.
   */
  status: 'PENDING' | 'PROCESSING' | 'INDEXED' | 'ERROR' | 'UNSUPPORTED' | 'DELETED';
  /** Arbitrary metadata from the extraction pipeline (headings, page count, etc.) */
  metadata: Record<string, unknown>;
  /**
   * Optional external fallback link (e.g. Google Drive web view URL).
   * Shown in Error and Empty states as a "View externally" escape hatch.
   */
  webViewLink?: string;
}

/**
 * ViewerMode — controls which shell chrome and sizing is applied.
 *
 * - drawer:   480px side panel, shows close button + "Open full view" CTA
 * - page:     Full viewport, no close button, expanded metadata
 * - artifact: Chat side panel, fixed height, minimal chrome
 * - inline:   No chrome at all, just the rendered content
 */
export type ViewerMode = 'drawer' | 'page' | 'artifact' | 'inline';

/**
 * ViewerProps — the contract that every viewer component in the MIME registry must implement.
 *
 * All viewer components (ImageViewer, VideoPlayer, PDFViewer, etc.) accept these props.
 * The FileViewerShell dispatches the correct viewer and passes these props through.
 */
export interface ViewerProps {
  /** The file to render */
  file: ViewerFile;
  /** Determines the surrounding chrome and sizing of the viewer shell */
  mode: ViewerMode;
  /** Optional Tailwind class overrides */
  className?: string;
}
