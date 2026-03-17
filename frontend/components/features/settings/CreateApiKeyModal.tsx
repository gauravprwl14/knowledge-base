'use client';

/**
 * CreateApiKeyModal — pure UI component for creating an API key.
 *
 * Two states:
 * 1. Form — enter name + optional expiry date
 * 2. Success — show the full key ONCE with copy button + security warning
 *
 * Receives all state/callbacks via props — no API calls.
 */

import { useForm } from 'react-hook-form';
import { useState, useCallback } from 'react';
import { X, Copy, Check, Loader2, ShieldAlert, Key } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreateApiKeyRequest } from '@/lib/types/auth.types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CreateApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateApiKeyRequest) => void;
  isLoading: boolean;
  /** Full key value — shown once on success, null while on the form */
  createdKey: string | null;
}

// ---------------------------------------------------------------------------
// Form shape
// ---------------------------------------------------------------------------

interface FormData {
  name: string;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Copy button with feedback
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed — silently ignore
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied!' : 'Copy key to clipboard'}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
        copied
          ? 'bg-[var(--color-status-success-bg)] text-[var(--color-status-success)] border border-[var(--color-status-success)]/30'
          : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)]',
      )}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          Copy
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CreateApiKeyModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  createdKey,
}: CreateApiKeyModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    defaultValues: { name: '', expiresAt: '' },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFormSubmit = (data: FormData) => {
    onSubmit({
      name: data.name.trim(),
      expiresAt: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
    });
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-key-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={createdKey ? handleClose : undefined}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-5 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--color-accent-muted)]">
              <Key className="w-4 h-4 text-[var(--color-accent)]" aria-hidden="true" />
            </div>
            <h2
              id="create-key-dialog-title"
              className="text-base font-semibold text-[var(--color-text-primary)]"
            >
              {createdKey ? 'API key created' : 'Create API key'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close dialog"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {createdKey ? (
            /* ----------------------------------------------------------------
             * Success state — show key once
             * -------------------------------------------------------------- */
            <div className="space-y-5">
              {/* Security warning */}
              <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--color-status-warning-bg)] border border-[var(--color-status-warning)]/20">
                <ShieldAlert
                  className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-status-warning)]"
                  aria-hidden="true"
                />
                <p className="text-sm text-[var(--color-status-warning)] leading-snug">
                  <strong>Save this key now.</strong> For security, we won&apos;t
                  show it again after you close this dialog.
                </p>
              </div>

              {/* Key display */}
              <div>
                <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                  Your API key
                </p>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)]">
                  <code className="flex-1 text-xs font-mono text-[var(--color-text-primary)] break-all select-all">
                    {createdKey}
                  </code>
                  <CopyButton text={createdKey} />
                </div>
              </div>

              {/* Done button */}
              <button
                type="button"
                onClick={handleClose}
                className="w-full h-10 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                Done, I&apos;ve saved my key
              </button>
            </div>
          ) : (
            /* ----------------------------------------------------------------
             * Form state — enter name + expiry
             * -------------------------------------------------------------- */
            <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
              {/* Name */}
              <div>
                <label
                  htmlFor="key-name"
                  className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5"
                >
                  Key name
                  <span className="text-[var(--color-status-error)] ml-0.5">*</span>
                </label>
                <input
                  id="key-name"
                  type="text"
                  autoFocus
                  placeholder="e.g. My application, CI pipeline"
                  aria-invalid={!!errors.name}
                  {...register('name', {
                    required: 'Key name is required',
                    minLength: { value: 2, message: 'Name must be at least 2 characters' },
                    maxLength: { value: 64, message: 'Name must be 64 characters or fewer' },
                  })}
                  className={cn(
                    'w-full h-10 px-3 rounded-lg text-sm outline-none transition-all',
                    'bg-[var(--color-bg-secondary)] border',
                    'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]',
                    'focus:ring-2 focus:ring-[var(--color-accent)]/30',
                    errors.name
                      ? 'border-[var(--color-status-error)]'
                      : 'border-[var(--color-border)] focus:border-[var(--color-accent)]',
                  )}
                />
                {errors.name && (
                  <p className="mt-1.5 text-xs text-[var(--color-status-error)]">
                    {errors.name.message}
                  </p>
                )}
              </div>

              {/* Expiry */}
              <div>
                <label
                  htmlFor="key-expires"
                  className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5"
                >
                  Expiry date{' '}
                  <span className="text-[var(--color-text-muted)] font-normal">
                    (optional — leave blank for no expiry)
                  </span>
                </label>
                <input
                  id="key-expires"
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  {...register('expiresAt')}
                  className={cn(
                    'w-full h-10 px-3 rounded-lg text-sm outline-none transition-all',
                    'bg-[var(--color-bg-secondary)] border border-[var(--color-border)]',
                    'text-[var(--color-text-primary)]',
                    'focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)]',
                  )}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isLoading}
                  className="flex-1 h-10 rounded-lg text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  aria-busy={isLoading}
                  className={cn(
                    'flex-1 h-10 rounded-lg text-sm font-semibold transition-all',
                    'bg-[var(--color-accent)] text-white',
                    'hover:bg-[var(--color-accent-hover)]',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                    'inline-flex items-center justify-center gap-2',
                  )}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    'Create key'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
