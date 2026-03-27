'use client';
import * as React from 'react';
import { HardDrive, BookOpen, FolderOpen, Unplug, Clock, RefreshCw, Loader2 } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/primitives/card/Card';
import { Badge, type BadgeVariant } from '@/components/primitives/badge/Badge';
import { Button } from '@/components/primitives/button/Button';
import type { KmsSource, SourceStatus, SourceType } from '@/lib/api/sources';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a SourceStatus to the Badge semantic variant.
 */
function statusToVariant(status: SourceStatus): BadgeVariant {
  switch (status) {
    case 'CONNECTED':
      return 'active';
    case 'EXPIRED':
    case 'PAUSED':
      return 'pending';
    case 'ERROR':
      return 'error';
    default:
      return 'inactive';
  }
}

/**
 * Returns a human-readable label for a SourceStatus.
 */
function statusLabel(status: SourceStatus): string {
  switch (status) {
    case 'CONNECTED':
      return 'Connected';
    case 'SCANNING':
      return 'Scanning';
    case 'COMPLETED':
      return 'Completed';
    case 'EXPIRED':
      return 'Token expired';
    case 'ERROR':
      return 'Error';
    case 'DISCONNECTED':
      return 'Disconnected';
    case 'PAUSED':
      return 'Paused';
    case 'IDLE':
      return 'Idle';
    case 'PENDING':
    default:
      return 'Pending';
  }
}

/**
 * Returns a default display name for a source type when none is set.
 */
function defaultDisplayName(type: SourceType): string {
  switch (type) {
    case 'OBSIDIAN':
      return 'Obsidian Vault';
    case 'LOCAL':
      return 'Local Folder';
    case 'GOOGLE_DRIVE':
    default:
      return 'Google Drive';
  }
}

/** Icon component mapped by source type. */
const sourceIconMap: Record<SourceType, React.ElementType> = {
  GOOGLE_DRIVE: HardDrive,
  OBSIDIAN: BookOpen,
  LOCAL: FolderOpen,
};

/**
 * Returns a relative-time string (e.g. "2 hours ago") for a given ISO timestamp.
 * Falls back to a formatted date when the timestamp is older than 7 days.
 */
function relativeTime(isoString: string): string {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const diffMs = new Date(isoString).getTime() - Date.now();
  const diffSecs = Math.round(diffMs / 1_000);
  const diffMins = Math.round(diffSecs / 60);
  const diffHours = Math.round(diffMins / 60);
  const diffDays = Math.round(diffHours / 24);

  if (Math.abs(diffSecs) < 60) return rtf.format(diffSecs, 'second');
  if (Math.abs(diffMins) < 60) return rtf.format(diffMins, 'minute');
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour');
  if (Math.abs(diffDays) < 7) return rtf.format(diffDays, 'day');

  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(isoString),
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SourceCardProps {
  /** The source data to display */
  source: KmsSource;
  /** Called when the user clicks "Disconnect". The parent handles the mutation. */
  onDisconnect: (id: string) => void;
  /** When true, the disconnect button shows a loading state */
  isDisconnecting?: boolean;
  /**
   * Called when the user triggers a scan.
   * The parent is responsible for calling the mutation.
   */
  onScan?: (sourceId: string, type: 'FULL' | 'INCREMENTAL') => void;
  /** When true, scan buttons show a loading state */
  isScanning?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * SourceCard — displays a connected knowledge source with status, last sync
 * timestamp, scan controls, and a disconnect action.
 *
 * Scan buttons are only shown when the source status is CONNECTED or IDLE.
 * An "Incremental Scan" button is additionally shown when `lastSyncedAt` is set.
 */
export function SourceCard({
  source,
  onDisconnect,
  isDisconnecting = false,
  onScan,
  isScanning = false,
}: SourceCardProps) {
  const SourceIcon = sourceIconMap[source.type] ?? HardDrive;
  const label = source.displayName ?? defaultDisplayName(source.type);
  const syncLabel = source.lastSyncedAt ? relativeTime(source.lastSyncedAt) : null;

  const canScan =
    onScan &&
    (source.status === 'CONNECTED' ||
      source.status === 'IDLE' ||
      source.status === 'COMPLETED');

  const canIncremental = canScan && Boolean(source.lastSyncedAt);

  return (
    <Card variant="outlined" className="w-full">
      <CardContent className="flex items-start gap-4">
        {/* Source type icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg-secondary)]">
          <SourceIcon className="h-5 w-5 text-[var(--color-text-secondary)]" aria-hidden="true" />
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[var(--color-text-primary)]">{label}</p>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={statusToVariant(source.status)}>{statusLabel(source.status)}</Badge>

            {/* Scanning spinner */}
            {source.status === 'SCANNING' && (
              <Loader2
                className="h-3.5 w-3.5 animate-spin text-[var(--color-text-secondary)]"
                aria-label="Scan in progress"
              />
            )}

            {syncLabel && (
              <span className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                <Clock className="h-3 w-3" aria-hidden="true" />
                Last synced {syncLabel}
              </span>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap justify-end gap-2">
        {/* Scan controls — only shown when source is connectable */}
        {canScan && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onScan(source.id, 'FULL')}
              disabled={isScanning || source.status === 'SCANNING'}
              aria-label={`Full scan ${label}`}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {isScanning ? 'Scanning…' : 'Scan Now'}
            </Button>

            {canIncremental && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onScan(source.id, 'INCREMENTAL')}
                disabled={isScanning || source.status === 'SCANNING'}
                aria-label={`Incremental scan ${label}`}
              >
                Incremental Scan
              </Button>
            )}
          </>
        )}

        <Button
          variant="danger"
          size="sm"
          onClick={() => onDisconnect(source.id)}
          disabled={isDisconnecting || source.status === 'DISCONNECTED'}
          aria-label={`Disconnect ${label}`}
        >
          <Unplug className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
        </Button>
      </CardFooter>
    </Card>
  );
}
