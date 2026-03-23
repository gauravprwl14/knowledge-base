'use client';

/**
 * PreferencesSection — theme, page size, and notification preferences.
 *
 * All preferences are persisted to localStorage under the `kms.*` namespace.
 * No backend calls are made (UI-only for notifications).
 */

import { useState, useEffect } from 'react';
import { Check, Monitor, Moon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Theme = 'dark' | 'system';
type PageSize = 20 | 50 | 100;

interface Preferences {
  theme: Theme;
  pageSize: PageSize;
  emailDigest: boolean;
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  theme: 'kms.theme',
  pageSize: 'kms.pageSize',
  emailDigest: 'kms.emailDigest',
} as const;

function loadPreferences(): Preferences {
  if (typeof window === 'undefined') {
    return { theme: 'dark', pageSize: 20, emailDigest: false };
  }
  return {
    theme: (localStorage.getItem(STORAGE_KEYS.theme) as Theme) ?? 'dark',
    pageSize: (Number(localStorage.getItem(STORAGE_KEYS.pageSize)) as PageSize) || 20,
    emailDigest: localStorage.getItem(STORAGE_KEYS.emailDigest) === 'true',
  };
}

function savePreferences(prefs: Preferences): void {
  localStorage.setItem(STORAGE_KEYS.theme, prefs.theme);
  localStorage.setItem(STORAGE_KEYS.pageSize, String(prefs.pageSize));
  localStorage.setItem(STORAGE_KEYS.emailDigest, String(prefs.emailDigest));
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PreferencesSection() {
  const [prefs, setPrefs] = useState<Preferences>({ theme: 'dark', pageSize: 20, emailDigest: false });
  const [saved, setSaved] = useState(false);

  // Hydrate from localStorage on mount (avoids SSR mismatch)
  useEffect(() => {
    setPrefs(loadPreferences());
  }, []);

  const handleSave = () => {
    savePreferences(prefs);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-8">
      {/* Theme */}
      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Theme</h3>
        <div className="flex gap-3">
          {(
            [
              { value: 'dark', label: 'Dark', Icon: Moon },
              { value: 'system', label: 'System', Icon: Monitor },
            ] as { value: Theme; label: string; Icon: React.ElementType }[]
          ).map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, theme: value }))}
              aria-pressed={prefs.theme === value}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                prefs.theme === value
                  ? 'border-[#a78bfa]/50 bg-[#a78bfa]/10 text-[#a78bfa]'
                  : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          &ldquo;System&rdquo; follows your OS dark/light preference.
        </p>
      </section>

      {/* Default page size */}
      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-1">Default file list page size</h3>
        <p className="text-xs text-slate-500 mb-3">
          How many files to show per page in file lists.
        </p>
        <div className="flex gap-3 flex-wrap">
          {([20, 50, 100] as PageSize[]).map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, pageSize: size }))}
              aria-pressed={prefs.pageSize === size}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                prefs.pageSize === size
                  ? 'border-[#a78bfa]/50 bg-[#a78bfa]/10 text-[#a78bfa]'
                  : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </section>

      {/* Notification preferences */}
      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Notifications</h3>
        <label className="flex items-center gap-3 cursor-pointer group w-fit">
          <div className="relative">
            <input
              type="checkbox"
              checked={prefs.emailDigest}
              onChange={(e) => setPrefs((p) => ({ ...p, emailDigest: e.target.checked }))}
              className="sr-only"
              aria-label="Email digest notifications"
            />
            <div
              className={`w-10 h-6 rounded-full border transition-all ${
                prefs.emailDigest
                  ? 'bg-[#a78bfa] border-[#a78bfa]'
                  : 'bg-white/5 border-white/10 group-hover:border-white/20'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                  prefs.emailDigest ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300 group-hover:text-slate-100 transition-colors">
              Email digest
            </p>
            <p className="text-xs text-slate-500">
              Receive a weekly summary of your knowledge base activity.
            </p>
          </div>
        </label>
      </section>

      {/* Save button */}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-[#a78bfa] text-white hover:opacity-90 transition-opacity"
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" />
              Saved!
            </>
          ) : (
            'Save preferences'
          )}
        </button>
        {saved && (
          <p role="status" className="text-sm text-green-400">
            Preferences saved.
          </p>
        )}
      </div>
    </div>
  );
}
