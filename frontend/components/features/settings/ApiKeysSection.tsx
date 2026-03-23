'use client';

/**
 * ApiKeysSection — lists, generates, and revokes API keys.
 *
 * Uses settingsApi directly (not the auth.api hooks) so this section
 * remains self-contained and testable in isolation.
 * The generated key is shown exactly once in a copy-to-clipboard dialog.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Key,
  Trash2,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  ShieldAlert,
  X,
  Clock,
} from 'lucide-react';
import { settingsApi, type ApiKey } from '@/lib/api/settings';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
      // Clipboard write failed silently
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied!' : 'Copy key to clipboard'}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        copied
          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
          : 'bg-white/5 text-slate-300 border border-white/10 hover:border-white/20'
      }`}
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
// Generate key modal
// ---------------------------------------------------------------------------

interface GenerateKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
  isLoading: boolean;
  createdKey: string | null;
}

function GenerateKeyModal({ isOpen, onClose, onSubmit, isLoading, createdKey }: GenerateKeyModalProps) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const handleClose = () => {
    setName('');
    setNameError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Key name is required.');
      return;
    }
    if (trimmed.length < 2) {
      setNameError('Name must be at least 2 characters.');
      return;
    }
    setNameError(null);
    await onSubmit(trimmed);
    setName('');
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-key-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={createdKey ? handleClose : undefined}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#13131f] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#a78bfa]/10 border border-[#a78bfa]/20">
              <Key className="w-4 h-4 text-[#a78bfa]" aria-hidden="true" />
            </div>
            <h2
              id="generate-key-dialog-title"
              className="text-base font-semibold text-slate-100"
            >
              {createdKey ? 'API key generated' : 'Generate API key'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close dialog"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {createdKey ? (
            /* Success state */
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" aria-hidden="true" />
                <p className="text-sm text-amber-300 leading-snug">
                  <strong>Save this key now.</strong> For security, we won&apos;t show it again after you close this dialog.
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-400 mb-2">Your new API key</p>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                  <code className="flex-1 text-xs font-mono text-slate-200 break-all select-all">
                    {createdKey}
                  </code>
                  <CopyButton text={createdKey} />
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="w-full h-10 rounded-lg text-sm font-semibold bg-[#a78bfa] text-white hover:opacity-90 transition-opacity"
              >
                Done, I&apos;ve saved my key
              </button>
            </div>
          ) : (
            /* Form state */
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="api-key-name"
                  className="block text-sm font-medium text-slate-400 mb-1.5"
                >
                  Key name <span className="text-red-400 ml-0.5">*</span>
                </label>
                <input
                  id="api-key-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  maxLength={64}
                  placeholder="e.g. CI pipeline, Staging app"
                  aria-invalid={!!nameError}
                  className={`w-full h-10 px-3 rounded-lg text-sm bg-white/5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#a78bfa]/40 transition-all border ${
                    nameError
                      ? 'border-red-500/50 focus:border-red-500/70'
                      : 'border-white/10 focus:border-[#a78bfa]/60'
                  }`}
                />
                {nameError && (
                  <p className="mt-1.5 text-xs text-red-400">{nameError}</p>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isLoading}
                  className="flex-1 h-10 rounded-lg text-sm font-medium border border-white/10 text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  aria-busy={isLoading}
                  className="flex-1 h-10 rounded-lg text-sm font-semibold bg-[#a78bfa] text-white hover:opacity-90 transition-opacity disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    'Generate key'
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

// ---------------------------------------------------------------------------
// Revoke confirm dialog
// ---------------------------------------------------------------------------

interface RevokeConfirmDialogProps {
  keyName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isRevoking: boolean;
}

function RevokeConfirmDialog({ keyName, onConfirm, onCancel, isRevoking }: RevokeConfirmDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="revoke-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-white/10 bg-[#13131f] p-6 shadow-2xl">
        <h3 id="revoke-dialog-title" className="text-base font-semibold text-slate-100 mb-2">
          Revoke API key?
        </h3>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          This will permanently revoke{' '}
          <span className="font-medium text-slate-200">&ldquo;{keyName}&rdquo;</span>.
          Any applications using this key will lose access immediately. This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isRevoking}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-white/10 text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isRevoking}
            aria-busy={isRevoking}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {isRevoking ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Revoking…
              </>
            ) : (
              'Revoke key'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key row
// ---------------------------------------------------------------------------

interface KeyRowProps {
  apiKey: ApiKey;
  onRevoke: (id: string) => void;
  isRevoking: boolean;
}

function KeyRow({ apiKey, onRevoke, isRevoking }: KeyRowProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <>
      <div className="flex items-center gap-4 px-5 py-4 rounded-xl border border-white/10 bg-white/[0.03] hover:border-white/20 transition-colors">
        {/* Icon */}
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 shrink-0">
          <Key className="w-4 h-4 text-slate-400" aria-hidden="true" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">{apiKey.name}</p>
          <p className="mt-0.5 text-xs font-mono text-slate-500">{apiKey.keyPreview}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
              Created {formatDate(apiKey.createdAt)}
            </span>
            <span>Last used: {formatDate(apiKey.lastUsedAt)}</span>
          </div>
        </div>

        {/* Revoke */}
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={isRevoking}
          aria-label={`Revoke API key "${apiKey.name}"`}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRevoking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" aria-hidden="true" />}
          Revoke
        </button>
      </div>

      {showConfirm && (
        <RevokeConfirmDialog
          keyName={apiKey.name}
          onConfirm={() => {
            onRevoke(apiKey.id);
            setShowConfirm(false);
          }}
          onCancel={() => setShowConfirm(false)}
          isRevoking={isRevoking}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ApiKeysSection() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const keys = await settingsApi.listApiKeys();
      setApiKeys(keys);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load API keys.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleOpenModal = () => {
    setCreatedKey(null);
    setModalOpen(true);
  };

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setCreatedKey(null);
    // Reload list so newly created key appears with server-assigned metadata
    loadKeys();
  }, [loadKeys]);

  const handleGenerateKey = useCallback(async (name: string) => {
    setIsGenerating(true);
    try {
      const result = await settingsApi.createApiKey(name);
      setCreatedKey(result.key);
      // Reload list will happen on modal close
    } catch (err) {
      setError((err as Error).message ?? 'Failed to generate API key.');
      setModalOpen(false);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const handleRevoke = useCallback(async (id: string) => {
    setRevokingId(id);
    try {
      await settingsApi.revokeApiKey(id);
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      setError((err as Error).message ?? 'Failed to revoke API key.');
    } finally {
      setRevokingId(null);
    }
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          API keys allow external applications to authenticate with the KMS API on your behalf.
        </p>
        <button
          type="button"
          onClick={handleOpenModal}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#a78bfa] text-white hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Generate new key
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" aria-hidden="true" />
          <p className="text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-xs text-red-400 hover:text-red-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" aria-label="Loading API keys" />
        </div>
      ) : apiKeys.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-14 rounded-xl border border-dashed border-white/10 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/5">
            <Key className="w-5 h-5 text-slate-500" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">No API keys yet</p>
            <p className="text-xs text-slate-500 mt-0.5">Generate your first key to integrate external applications</p>
          </div>
          <button
            type="button"
            onClick={handleOpenModal}
            className="mt-1 text-xs text-[#a78bfa] hover:opacity-80 transition-opacity font-medium"
          >
            Generate API key
          </button>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Your API keys">
          {apiKeys.map((key) => (
            <li key={key.id}>
              <KeyRow
                apiKey={key}
                onRevoke={handleRevoke}
                isRevoking={revokingId === key.id}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Generate key modal */}
      <GenerateKeyModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        onSubmit={handleGenerateKey}
        isLoading={isGenerating}
        createdKey={createdKey}
      />
    </div>
  );
}
