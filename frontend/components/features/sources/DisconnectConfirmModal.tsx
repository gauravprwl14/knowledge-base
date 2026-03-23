'use client';

import * as React from 'react';
import { AlertTriangle, Loader2, Trash2, Unplug } from 'lucide-react';
import { Button } from '@/components/primitives/button/Button';
import { kmsSourcesApi, type KmsSource, type ClearJobStatus } from '@/lib/api/sources';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DisconnectConfirmModalProps {
  source: KmsSource;
  open: boolean;
  onClose: () => void;
  /** Called after successful disconnect (with or without clear). */
  onDone: (sourceId: string) => void;
}

// ---------------------------------------------------------------------------
// Polling helper
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;

async function pollClearStatus(
  sourceId: string,
  onProgress: (job: ClearJobStatus) => void,
  signal: AbortSignal,
): Promise<void> {
  const start = Date.now();
  while (!signal.aborted) {
    if (Date.now() - start > POLL_TIMEOUT_MS) {
      throw new Error('Timed out waiting for data clear to complete');
    }
    const job = await kmsSourcesApi.getClearStatus(sourceId);
    if (job) {
      onProgress(job);
      if (job.status === 'COMPLETED' || job.status === 'FAILED') return;
    }
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Phase = 'confirm' | 'clearing' | 'done' | 'error';

export function DisconnectConfirmModal({
  source,
  open,
  onClose,
  onDone,
}: DisconnectConfirmModalProps) {
  const [phase, setPhase] = React.useState<Phase>('confirm');
  const [clearJob, setClearJob] = React.useState<ClearJobStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  // Reset state whenever the modal opens
  React.useEffect(() => {
    if (open) {
      setPhase('confirm');
      setClearJob(null);
      setError(null);
      setIsSubmitting(false);
    } else {
      abortRef.current?.abort();
    }
  }, [open]);

  if (!open) return null;

  const label = source.displayName ?? source.type.replace('_', ' ');

  async function handleDisconnect(clearData: boolean) {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await kmsSourcesApi.disconnect(source.id, clearData);

      if (clearData && result?.jobId) {
        setPhase('clearing');
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        await pollClearStatus(
          source.id,
          (job) => setClearJob(job),
          ctrl.signal,
        );

        const finalJob = await kmsSourcesApi.getClearStatus(source.id);
        if (finalJob?.status === 'FAILED') {
          setError(`Data clear failed: ${finalJob.errorMsg ?? 'unknown error'}`);
          setPhase('error');
          return;
        }
      }

      setPhase('done');
      setTimeout(() => {
        onDone(source.id);
        onClose();
      }, 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setPhase('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="disconnect-modal-title"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-6 shadow-xl">

        {/* ── Confirm phase ── */}
        {phase === 'confirm' && (
          <>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
              </div>
              <h2
                id="disconnect-modal-title"
                className="text-lg font-semibold text-[var(--color-text-primary)]"
              >
                Disconnect {label}?
              </h2>
            </div>

            <p className="mb-6 text-sm text-[var(--color-text-secondary)]">
              Choose what happens to the indexed data from this source.
            </p>

            <div className="flex flex-col gap-3">
              {/* Option A — disconnect only */}
              <button
                onClick={() => handleDisconnect(false)}
                disabled={isSubmitting}
                className="flex w-full items-start gap-3 rounded-xl border border-[var(--color-border)] p-4 text-left transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
              >
                <Unplug className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-text-secondary)]" aria-hidden="true" />
                <div>
                  <p className="font-medium text-[var(--color-text-primary)]">Disconnect only</p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                    Stop syncing. Keep all indexed files and search results.
                  </p>
                </div>
              </button>

              {/* Option B — disconnect + clear */}
              <button
                onClick={() => handleDisconnect(true)}
                disabled={isSubmitting}
                className="flex w-full items-start gap-3 rounded-xl border border-red-200 p-4 text-left transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-hidden="true" />
                <div>
                  <p className="font-medium text-red-700">Disconnect &amp; clear data</p>
                  <p className="mt-0.5 text-xs text-red-500">
                    Remove all indexed files, chunks, and vector embeddings for this source. This cannot be undone.
                  </p>
                </div>
              </button>
            </div>

            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="mt-4 w-full rounded-lg py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        )}

        {/* ── Clearing phase ── */}
        {phase === 'clearing' && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-[var(--color-accent)]" aria-label="Clearing data" />
            <div>
              <p className="font-medium text-[var(--color-text-primary)]">Clearing indexed data…</p>
              {clearJob && (
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {clearJob.filesDeleted ?? 0} files · {clearJob.chunksDeleted ?? 0} chunks removed
                </p>
              )}
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">This may take a moment.</p>
            </div>
          </div>
        )}

        {/* ── Done phase ── */}
        {phase === 'done' && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Unplug className="h-6 w-6 text-green-600" aria-hidden="true" />
            </div>
            <p className="font-medium text-[var(--color-text-primary)]">Disconnected successfully</p>
          </div>
        )}

        {/* ── Error phase ── */}
        {phase === 'error' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" aria-hidden="true" />
              <p className="font-medium text-red-700">Action failed</p>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)]">{error}</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
