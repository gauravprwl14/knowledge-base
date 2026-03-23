'use client';

/**
 * TranscriptionStatusBadge — compact pill badge showing the transcription job status
 * for audio and video files.
 *
 * Renders as an inline pill with an icon and a short label.
 * PENDING/PROCESSING → amber with spinning loader
 * COMPLETED          → green with check icon (+ formatted duration when available)
 * FAILED             → red with x icon
 * SKIPPED            → gray with mic icon
 */

import * as React from 'react';
import { Mic, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TranscriptionStatus } from '@/lib/api/files';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a duration in seconds to a "m:ss" string (e.g. 123 → "2:03").
 */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

interface StatusConfig {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  /** Additional label suffix appended after a · separator */
  suffix?: string;
  pillClass: string;
  iconClass: string;
  spin?: boolean;
}

function getStatusConfig(job: TranscriptionStatus): StatusConfig {
  switch (job.status) {
    case 'PENDING':
    case 'PROCESSING':
      return {
        Icon: Loader2,
        label: 'Transcribing\u2026',
        pillClass: 'bg-amber-50 border-amber-200 text-amber-700',
        iconClass: 'text-amber-500',
        spin: true,
      };
    case 'COMPLETED': {
      const suffix =
        job.durationSeconds != null
          ? formatDuration(job.durationSeconds)
          : undefined;
      return {
        Icon: CheckCircle2,
        label: 'Transcribed',
        suffix,
        pillClass: 'bg-emerald-50 border-emerald-200 text-emerald-700',
        iconClass: 'text-emerald-500',
      };
    }
    case 'FAILED':
      return {
        Icon: XCircle,
        label: 'Transcription failed',
        pillClass: 'bg-red-50 border-red-200 text-red-700',
        iconClass: 'text-red-500',
      };
    case 'SKIPPED':
    default:
      return {
        Icon: Mic,
        label: 'Transcription skipped',
        pillClass: 'bg-gray-100 border-gray-200 text-gray-500',
        iconClass: 'text-gray-400',
      };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface TranscriptionStatusBadgeProps {
  /** The transcription job to display. */
  job: TranscriptionStatus;
  /** Additional class names for the pill wrapper. */
  className?: string;
}

/**
 * Pill badge that shows the current transcription status for an audio/video file.
 */
export function TranscriptionStatusBadge({ job, className }: TranscriptionStatusBadgeProps) {
  const { Icon, label, suffix, pillClass, iconClass, spin } = getStatusConfig(job);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
        pillClass,
        className,
      )}
      title={job.errorMsg ?? label}
    >
      <Icon
        className={cn('h-3 w-3 shrink-0', iconClass, spin && 'animate-spin')}
        aria-hidden="true"
      />
      <span>{label}</span>
      {suffix && (
        <>
          <span aria-hidden="true">&middot;</span>
          <span>{suffix}</span>
        </>
      )}
    </span>
  );
}
