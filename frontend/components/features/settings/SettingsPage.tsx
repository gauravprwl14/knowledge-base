'use client';

/**
 * SettingsPage — tabbed settings layout.
 *
 * Left sidebar navigation (Profile | API Keys | Preferences | Danger Zone)
 * with the active section rendered in the right content pane.
 * On mobile, the sidebar collapses into a <select> dropdown.
 */

import { useState } from 'react';
import { User, Key, SlidersHorizontal, AlertTriangle } from 'lucide-react';
import { ProfileSection } from './ProfileSection';
import { ApiKeysSection } from './ApiKeysSection';
import { PreferencesSection } from './PreferencesSection';
import { DangerZoneSection } from './DangerZoneSection';

// ---------------------------------------------------------------------------
// Tab definition
// ---------------------------------------------------------------------------

type TabId = 'profile' | 'api-keys' | 'preferences' | 'danger-zone';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
  description: string;
  danger?: boolean;
}

const TABS: Tab[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
    description: 'Manage your name and account details',
  },
  {
    id: 'api-keys',
    label: 'API Keys',
    icon: Key,
    description: 'Manage your API credentials',
  },
  {
    id: 'preferences',
    label: 'Preferences',
    icon: SlidersHorizontal,
    description: 'Theme, page size, notifications',
  },
  {
    id: 'danger-zone',
    label: 'Danger Zone',
    icon: AlertTriangle,
    description: 'Irreversible account actions',
    danger: true,
  },
];

function SectionContent({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'profile':
      return <ProfileSection />;
    case 'api-keys':
      return <ApiKeysSection />;
    case 'preferences':
      return <PreferencesSection />;
    case 'danger-zone':
      return <DangerZoneSection />;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  const activeTabDef = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8 max-w-5xl mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage your account, API keys, and preferences.
        </p>
      </div>

      {/* Mobile: select dropdown */}
      <div className="md:hidden">
        <label htmlFor="settings-tab-select" className="sr-only">
          Settings section
        </label>
        <select
          id="settings-tab-select"
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as TabId)}
          className="w-full h-10 px-3 rounded-lg text-sm bg-white/5 border border-white/10 text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#a78bfa]/40 focus:border-[#a78bfa]/60 appearance-none"
        >
          {TABS.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.label}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop: sidebar + content layout */}
      <div className="flex gap-6">
        {/* Sidebar */}
        <nav
          aria-label="Settings navigation"
          className="hidden md:flex flex-col gap-1 w-52 shrink-0"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-left transition-all ${
                  isActive
                    ? tab.danger
                      ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                      : 'bg-[#a78bfa]/10 border border-[#a78bfa]/20 text-[#a78bfa]'
                    : tab.danger
                    ? 'text-red-400/60 hover:bg-red-500/5 hover:text-red-400 border border-transparent hover:border-red-500/10'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent hover:border-white/10'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content pane */}
        <div className="flex-1 min-w-0">
          {/* Section header */}
          <div className="mb-6 pb-5 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
                  activeTabDef.danger
                    ? 'bg-red-500/10 border border-red-500/20'
                    : 'bg-[#a78bfa]/10 border border-[#a78bfa]/20'
                }`}
              >
                <activeTabDef.icon
                  className={`w-4 h-4 ${activeTabDef.danger ? 'text-red-400' : 'text-[#a78bfa]'}`}
                  aria-hidden="true"
                />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-100">{activeTabDef.label}</h2>
                <p className="text-xs text-slate-400">{activeTabDef.description}</p>
              </div>
            </div>
          </div>

          {/* Active section */}
          <SectionContent tab={activeTab} />
        </div>
      </div>
    </div>
  );
}
