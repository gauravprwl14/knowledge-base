'use client';

/**
 * DangerZoneSection — destructive account actions.
 *
 * Currently exposes one action: delete account.
 * A confirmation modal requires the user to type their email before proceeding.
 */

import { useState, useCallback } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useCurrentUser } from '@/lib/stores/auth.store';

// ---------------------------------------------------------------------------
// Delete account modal
// ---------------------------------------------------------------------------

interface DeleteAccountModalProps {
  email: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

function DeleteAccountModal({ email, onClose, onConfirm, isDeleting }: DeleteAccountModalProps) {
  const [typed, setTyped] = useState('');
  const canConfirm = typed === email;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-red-500/20 bg-[#13131f] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-400" aria-hidden="true" />
            </div>
            <h2
              id="delete-account-dialog-title"
              className="text-base font-semibold text-slate-100"
            >
              Delete account
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Close dialog"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-300 leading-relaxed">
              <strong>This action is permanent and cannot be undone.</strong> All your files, sources, collections, and API keys will be permanently deleted.
            </p>
          </div>

          <div>
            <label htmlFor="confirm-email" className="block text-sm font-medium text-slate-400 mb-1.5">
              Type your email address to confirm:{' '}
              <span className="font-mono text-slate-300">{email}</span>
            </label>
            <input
              id="confirm-email"
              type="email"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={email}
              autoComplete="off"
              className="w-full h-10 px-3 rounded-lg text-sm bg-white/5 border border-white/10 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/50 transition-all"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 h-10 rounded-lg text-sm font-medium border border-white/10 text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canConfirm || isDeleting}
              aria-busy={isDeleting}
              className="flex-1 h-10 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                'Delete my account'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DangerZoneSection() {
  const user = useCurrentUser();
  const [modalOpen, setModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    setError(null);
    try {
      // Backend endpoint not yet implemented — placeholder call
      await apiClient_deleteAccount();
      // On success, redirect to login / clear session
      window.location.href = '/en/login?deleted=true';
    } catch (err) {
      setError((err as Error).message ?? 'Failed to delete account. Please contact support.');
      setModalOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }, []);

  return (
    <div className="space-y-5">
      {/* Warning banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" aria-hidden="true" />
        <p className="text-sm text-red-300">
          Actions in this section are <strong>irreversible</strong>. Please proceed with caution.
        </p>
      </div>

      {/* Delete account */}
      <div className="flex items-start justify-between gap-6 p-5 rounded-xl border border-red-500/20 bg-red-500/[0.03]">
        <div>
          <p className="text-sm font-semibold text-slate-200">Delete account</p>
          <p className="mt-1 text-sm text-slate-400">
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 transition-all"
        >
          Delete account
        </button>
      </div>

      {/* Error */}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Modal */}
      {modalOpen && user && (
        <DeleteAccountModal
          email={user.email}
          onClose={() => setModalOpen(false)}
          onConfirm={handleConfirmDelete}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stub — replace with real API call when backend endpoint is ready
// ---------------------------------------------------------------------------

async function apiClient_deleteAccount(): Promise<void> {
  // TODO: replace with apiClient.delete('/users/me') when implemented
  throw new Error('Account deletion is not yet available. Please contact support.');
}
