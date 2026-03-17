'use client';
import * as React from 'react';
import { HardDrive, Unplug, Clock } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/primitives/card/Card';
import { Badge, type BadgeVariant } from '@/components/primitives/badge/Badge';
import { Button } from '@/components/primitives/button/Button';
import type { KmsSource, SourceStatus } from '@/lib/api/sources';

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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * SourceCard — displays a connected knowledge source with status, last sync
 * timestamp, and a disconnect action.
 */
export function SourceCard({ source, onDisconnect, isDisconnecting = false }: SourceCardProps) {
  const formattedSync = source.lastSyncedAt
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(source.lastSyncedAt))
    : null;

  return (
    <Card variant="outlined" className="w-full">
      <CardContent className="flex items-start gap-4">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg-secondary)]">
          <HardDrive className="h-5 w-5 text-[var(--color-text-secondary)]" aria-hidden="true" />
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[var(--color-text-primary)]">
            {source.displayName ?? 'Google Drive'}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={statusToVariant(source.status)}>{statusLabel(source.status)}</Badge>

            {formattedSync && (
              <span className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                <Clock className="h-3 w-3" aria-hidden="true" />
                Last synced {formattedSync}
              </span>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex justify-end">
        <Button
          variant="danger"
          size="sm"
          onClick={() => onDisconnect(source.id)}
          disabled={isDisconnecting || source.status === 'DISCONNECTED'}
          aria-label={`Disconnect ${source.displayName ?? 'Google Drive'}`}
        >
          <Unplug className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
        </Button>
      </CardFooter>
    </Card>
  );
}
