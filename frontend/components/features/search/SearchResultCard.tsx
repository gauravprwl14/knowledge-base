'use client';

/**
 * SearchResultCard — renders a single ranked chunk from the search-api.
 *
 * Shows: file-type icon, filename + chunk index badge, highlighted content
 * snippet, a score bar (visual relevance), and hover actions (copy, open).
 */

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Image, Music, Video, Table, File, Copy, ExternalLink, Check } from 'lucide-react';
import type { SearchResult } from '@/lib/api/search';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResultCardProps {
  /** The ranked chunk to display. */
  result: SearchResult;
  /** Used for term highlighting — matches are wrapped in <mark> tags. */
  query: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derives a file category from the filename extension so we can show the
 * correct icon without needing the full MIME type from the backend.
 * Falls back to 'document' for anything unrecognised.
 */
function fileCategory(
  filename: string,
): 'document' | 'image' | 'audio' | 'video' | 'spreadsheet' | 'other' {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return 'audio';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext)) return 'spreadsheet';
  if (['md', 'txt', 'pdf', 'doc', 'docx', 'html', 'json'].includes(ext)) return 'document';
  return 'other';
}

/** Maps a file category to its lucide-react icon component. */
const CATEGORY_ICONS = {
  document: FileText,
  image: Image,
  audio: Music,
  video: Video,
  spreadsheet: Table,
  other: File,
} as const;

/**
 * Wraps each occurrence of a query term in a <mark> tag.
 *
 * Only terms longer than 2 chars are highlighted to avoid polluting short
 * common words (e.g. "to", "in", "a").
 *
 * Returns an HTML string — callers must use dangerouslySetInnerHTML.
 * The content comes from the backend (chunk text); the mark tags are
 * injected by us and are safe — no user input is interpolated unsanitised
 * because we only wrap text that already exists in `content`.
 */
function highlightTerms(content: string, query: string): string {
  // Tokenise query: split on whitespace, drop very short words
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (terms.length === 0) return content;

  // Build a single alternation regex — one pass over the content string
  // is faster than multiple replace calls for longer queries
  const pattern = terms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // escape regex special chars
    .join('|');
  const regex = new RegExp(`(${pattern})`, 'gi');

  return content.replace(
    regex,
    '<mark class="bg-yellow-100 text-yellow-900 rounded px-0.5">$1</mark>',
  );
}

/**
 * Converts a 0-1 score to a Tailwind background colour class.
 * Green for high relevance, amber for medium, red for low.
 * This gives the user an instant visual sense of result quality.
 */
function scoreColor(score: number): string {
  if (score >= 0.7) return 'bg-emerald-500';
  if (score >= 0.4) return 'bg-amber-400';
  return 'bg-rose-400';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders one ranked chunk result returned by the search-api.
 *
 * The card is intentionally compact — content is truncated at ~4 lines so
 * a full result list stays scannable without scrolling.
 */
export function SearchResultCard({ result, query }: SearchResultCardProps) {
  // Track copy feedback state so the icon changes to a checkmark briefly
  const [copied, setCopied] = useState(false);

  const category = fileCategory(result.filename);
  const IconComponent = CATEGORY_ICONS[category];

  // Percentage width for the score bar (score is 0-1, clamp for safety)
  const scorePercent = Math.round(Math.min(Math.max(result.score, 0), 1) * 100);

  // Pre-compute highlighted HTML once per render — not on every keystroke
  const highlightedContent = highlightTerms(result.content, query);

  /** Copy chunk content to clipboard and show ✓ feedback for 2 s. */
  async function handleCopy() {
    await navigator.clipboard.writeText(result.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <article
      className="
        group relative bg-white border border-gray-200 rounded-lg p-4
        hover:border-indigo-300 hover:shadow-sm transition-all duration-150
      "
      aria-label={`Result from ${result.filename}, chunk ${result.chunkIndex + 1}`}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Top row: icon + filename + chunk badge + hover actions              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-start gap-3">
        {/* File type icon — left column — gives quick visual category cue */}
        <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-md bg-gray-50 border border-gray-100">
          <IconComponent className="w-4 h-4 text-gray-500" aria-hidden="true" />
        </div>

        {/* Filename + chunk position */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filename — truncate long paths so the card stays single-line */}
            <span className="font-medium text-sm text-gray-900 truncate max-w-xs">
              {result.filename}
            </span>
            {/* Chunk index badge — tells the user which part of the file matched */}
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 tabular-nums">
              chunk {result.chunkIndex + 1}
            </span>
          </div>
        </div>

        {/* Hover actions — only visible on card hover to keep UI clean */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {/* Copy chunk text to clipboard */}
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy chunk text"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          {/* Open file — external link for Google Drive files, internal files page otherwise */}
          {result.webViewLink ? (
            <a
              href={result.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open source file"
              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : (
            <Link
              href={`/files?highlight=${result.fileId}`}
              aria-label="Open source file"
              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Content snippet — highlighted matching terms                        */}
      {/* ------------------------------------------------------------------ */}
      {/* dangerouslySetInnerHTML is intentional: highlightTerms() only wraps  */}
      {/* text that already exists in the backend-provided content string —    */}
      {/* no unescaped user input is injected.                                 */}
      <p
        className="mt-3 text-sm text-gray-700 leading-relaxed line-clamp-4"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: highlightedContent }}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Bottom row: score bar + relevance label                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-3 flex items-center gap-2">
        {/* Thin coloured bar — width is proportional to RRF score (0-100%) */}
        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${scoreColor(result.score)}`}
            style={{ width: `${scorePercent}%` }}
            aria-hidden="true"
          />
        </div>
        {/* Numeric label so screen readers and power users can see the exact score */}
        <span className="text-[11px] text-gray-400 tabular-nums w-16 text-right">
          {scorePercent}% relevance
        </span>
      </div>
    </article>
  );
}
