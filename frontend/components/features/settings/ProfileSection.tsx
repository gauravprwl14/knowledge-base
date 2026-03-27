'use client';

/**
 * ProfileSection — displays and edits the current user's profile.
 *
 * Shows avatar initials, name, email. Inline edit toggles a form
 * that calls PATCH /api/v1/users/me via settingsApi.updateProfile.
 */

import { useState, useCallback } from 'react';
import { Pencil, Check, X, Loader2, AlertCircle, User } from 'lucide-react';
import { settingsApi } from '@/lib/api/settings';
import { login, useCurrentUser } from '@/lib/stores/auth.store';
import { useAccessToken } from '@/lib/stores/auth.store';

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

function AvatarCircle({ name, email }: { name: string; email: string }) {
  const initials = name
    ? name.trim().charAt(0).toUpperCase()
    : email.trim().charAt(0).toUpperCase();

  const displayName = name || email;
  return (
    <div
      aria-label={`Avatar for ${displayName}`}
      className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#818cf8] text-white text-xl font-bold shrink-0 select-none"
    >
      {initials}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProfileSection() {
  const user = useCurrentUser();
  const accessToken = useAccessToken();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleStartEdit = useCallback(() => {
    setEditName(user?.name ?? '');
    setError(null);
    setSuccessMsg(null);
    setIsEditing(true);
  }, [user?.name]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setError('Display name cannot be empty.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const updated = await settingsApi.updateProfile(trimmed);
      // Sync the auth store so the topbar / sidebar reflects the new name
      if (accessToken) {
        login(
          {
            id: updated.id,
            email: updated.email,
            name: updated.name,
            roles: updated.roles,
            avatarUrl: updated.avatarUrl,
          },
          accessToken,
        );
      }
      setIsEditing(false);
      setSuccessMsg('Profile updated successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to update profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [editName, accessToken]);

  if (!user) {
    return (
      <div className="flex items-center gap-3 py-8 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading profile…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile card */}
      <div className="flex items-center gap-5 p-6 rounded-xl border border-white/10 bg-white/[0.03]">
        <AvatarCircle name={user.name} email={user.email} />

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <label htmlFor="display-name" className="block text-xs font-medium text-slate-400">
                Display name
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="display-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                    if (e.key === 'Escape') handleCancel();
                  }}
                  autoFocus
                  maxLength={64}
                  placeholder="Your display name"
                  className="flex-1 h-9 px-3 rounded-lg text-sm bg-white/5 border border-white/10 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#a78bfa]/40 focus:border-[#a78bfa]/60 transition-all"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isLoading}
                  aria-label="Save display name"
                  className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#a78bfa]/20 border border-[#a78bfa]/30 text-[#a78bfa] hover:bg-[#a78bfa]/30 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isLoading}
                  aria-label="Cancel editing"
                  className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 text-slate-400 hover:bg-white/5 hover:text-slate-200 disabled:opacity-50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {error && (
                <p className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold text-slate-100 truncate">
                  {user.name || '—'}
                </p>
                <button
                  type="button"
                  onClick={handleStartEdit}
                  aria-label="Edit display name"
                  className="flex items-center justify-center w-6 h-6 rounded-md text-slate-400 hover:text-[#a78bfa] hover:bg-white/5 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-sm text-slate-400 truncate">{user.email}</p>
              {user.roles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {user.roles.map((role) => (
                    <span
                      key={role}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#a78bfa]/10 text-[#a78bfa] border border-[#a78bfa]/20"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {!isEditing && (
          <button
            type="button"
            onClick={handleStartEdit}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-white/10 text-slate-300 hover:bg-white/5 hover:border-white/20 transition-all"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            Edit profile
          </button>
        )}
      </div>

      {/* Account info row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Account ID</p>
          </div>
          <p className="text-sm font-mono text-slate-300 truncate">{user.id}</p>
        </div>
        <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Email</p>
          </div>
          <p className="text-sm text-slate-300 truncate">{user.email}</p>
        </div>
      </div>

      {/* Success message */}
      {successMsg && (
        <div
          role="status"
          className="flex items-center gap-2 px-4 py-3 rounded-lg border border-green-500/20 bg-green-500/10 text-sm text-green-400"
        >
          <Check className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}
    </div>
  );
}
