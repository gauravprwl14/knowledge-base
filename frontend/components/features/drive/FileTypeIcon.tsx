'use client';

/**
 * FileTypeIcon — maps a MIME type to a lucide-react icon and a Tailwind color class.
 *
 * Used by FileCard (grid) and FileRow (list) to give each file a visual type hint.
 */

import * as React from 'react';
import {
  FileText,
  File,
  Image,
  Music,
  Video,
  Table,
  FileCode,
  type LucideProps,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Type map
// ---------------------------------------------------------------------------

/** The icon + color pair resolved for a given MIME type. */
export interface FileTypeInfo {
  /** The lucide-react icon component */
  Icon: React.ComponentType<LucideProps>;
  /** Tailwind text-color class */
  colorClass: string;
  /** Short human-readable label (PDF, DOCX, XLSX, MD, Image, Audio, Video) */
  label: string;
}

/**
 * Resolves a MIME type to an icon, color, and label.
 * Falls back to the generic File icon for unknown types.
 */
export function getFileTypeInfo(mimeType: string): FileTypeInfo {
  // PDF
  if (mimeType === 'application/pdf') {
    return { Icon: FileText, colorClass: 'text-red-500', label: 'PDF' };
  }

  // Word / DOCX
  if (
    mimeType === 'application/msword' ||
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return { Icon: FileText, colorClass: 'text-blue-500', label: 'DOCX' };
  }

  // Excel / XLSX
  if (
    mimeType === 'application/vnd.ms-excel' ||
    mimeType ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'text/csv'
  ) {
    return { Icon: Table, colorClass: 'text-green-500', label: 'XLSX' };
  }

  // PowerPoint / PPTX
  if (
    mimeType === 'application/vnd.ms-powerpoint' ||
    mimeType ===
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return { Icon: FileText, colorClass: 'text-orange-500', label: 'PPTX' };
  }

  // Markdown
  if (mimeType === 'text/markdown' || mimeType === 'text/x-markdown') {
    return { Icon: FileCode, colorClass: 'text-violet-500', label: 'MD' };
  }

  // Plain text / HTML
  if (mimeType === 'text/plain' || mimeType === 'text/html') {
    return { Icon: FileText, colorClass: 'text-slate-500', label: 'TXT' };
  }

  // Images
  if (mimeType.startsWith('image/')) {
    return { Icon: Image, colorClass: 'text-teal-500', label: 'Image' };
  }

  // Audio
  if (mimeType.startsWith('audio/')) {
    return { Icon: Music, colorClass: 'text-amber-500', label: 'Audio' };
  }

  // Video
  if (mimeType.startsWith('video/')) {
    return { Icon: Video, colorClass: 'text-purple-500', label: 'Video' };
  }

  // JSON / XML / code
  if (
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'text/xml'
  ) {
    return { Icon: FileCode, colorClass: 'text-cyan-500', label: 'Code' };
  }

  // Default fallback
  return { Icon: File, colorClass: 'text-gray-400', label: 'File' };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface FileTypeIconProps extends LucideProps {
  /** Raw MIME type string from the API */
  mimeType: string;
}

/**
 * Renders the appropriate icon for a given MIME type with its semantic color.
 */
export function FileTypeIcon({ mimeType, className, ...props }: FileTypeIconProps) {
  const { Icon, colorClass } = getFileTypeInfo(mimeType);
  return (
    <Icon
      className={[colorClass, className].filter(Boolean).join(' ')}
      aria-hidden="true"
      {...props}
    />
  );
}
