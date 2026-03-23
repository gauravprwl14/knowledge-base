'use client';

import { Settings, Key } from 'lucide-react';
import { Link } from '@/i18n/routing';

export default function SettingsPage() {
  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Settings</h1>

      <div className="space-y-2">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Link href={'/settings/api-keys' as any}>
          <div className="flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/[0.07] hover:border-white/20 transition-all cursor-pointer">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#93c5fd]/10 border border-[#93c5fd]/20 shrink-0">
              <Key className="w-5 h-5 text-[#93c5fd]" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">API Keys</p>
              <p className="text-xs text-slate-500">Manage your API credentials</p>
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/5 opacity-50 cursor-not-allowed">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#525252]/10 border border-[#525252]/20 shrink-0">
            <Settings className="w-5 h-5 text-[#525252]" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">Preferences</p>
            <p className="text-xs text-slate-600">Theme, language, notifications — coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}
