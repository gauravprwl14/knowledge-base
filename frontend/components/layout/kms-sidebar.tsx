'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useState, useCallback } from 'react';
import {
  LayoutDashboard,
  Database,
  Files,
  Search,
  Copy,
  Trash2,
  GitGraph,
  MessageSquare,
  Mic,
  FolderOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Nav item definitions
// ---------------------------------------------------------------------------

interface NavItem {
  icon: React.ElementType;
  label: string;
  /** Relative path after /[locale] */
  path: string;
  key: string;
}

const NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', key: 'dashboard' },
  { icon: Database, label: 'Sources', path: '/sources', key: 'sources' },
  { icon: Files, label: 'Files', path: '/files', key: 'files' },
  { icon: Search, label: 'Search', path: '/search', key: 'search' },
  { icon: Copy, label: 'Duplicates', path: '/duplicates', key: 'duplicates' },
  { icon: Trash2, label: 'Junk', path: '/junk', key: 'junk' },
  { icon: GitGraph, label: 'Graph', path: '/graph', key: 'graph' },
  { icon: MessageSquare, label: 'Chat', path: '/chat', key: 'chat' },
  { icon: Mic, label: 'Transcribe', path: '/transcribe', key: 'transcribe' },
  { icon: FolderOpen, label: 'Collections', path: '/collections', key: 'collections' },
  { icon: Settings, label: 'Settings', path: '/settings', key: 'settings' },
];

// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------

/**
 * KMS Sidebar — fixed left navigation rail.
 *
 * - Desktop: shows icon + label (240px wide), collapses to icon-only (56px) on toggle.
 * - Mobile: hidden by default, overlays when menu is open (controlled externally
 *   or via the collapse toggle button).
 */
export function KmsSidebar() {
  const pathname = usePathname();
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const [collapsed, setCollapsed] = useState(false);

  const toggle = useCallback(() => setCollapsed((v) => !v), []);

  return (
    <>
      {/* Sidebar panel */}
      <aside
        style={{
          width: collapsed ? '56px' : 'var(--sidebar-width)',
        }}
        className="
          fixed left-0 top-[var(--topbar-height)] bottom-0 z-40
          flex flex-col
          bg-[var(--color-surface)] border-r border-[var(--color-border)]
          kms-sidebar-transition
          hidden md:flex
        "
      >
        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          <ul className="flex flex-col gap-0.5 px-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const href = `/${locale}${item.path}`;
              const isActive =
                pathname === href ||
                (item.path !== '/dashboard' && pathname?.startsWith(href));

              return (
                <li key={item.key}>
                  <Link
                    href={href}
                    title={collapsed ? item.label : undefined}
                    className={`
                      flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium
                      transition-colors duration-100
                      ${
                        isActive
                          ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]'
                      }
                      ${collapsed ? 'justify-center' : ''}
                    `}
                  >
                    <Icon
                      className={`shrink-0 ${isActive ? 'text-[var(--color-accent)]' : ''}`}
                      size={16}
                      strokeWidth={isActive ? 2 : 1.5}
                    />
                    {!collapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Collapse toggle — bottom of sidebar */}
        <div className="border-t border-[var(--color-border)] p-2">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="
              flex items-center justify-center w-full h-8 rounded-lg
              text-[var(--color-text-muted)]
              hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]
              transition-colors
            "
          >
            {collapsed ? (
              <ChevronRight size={14} />
            ) : (
              <ChevronLeft size={14} />
            )}
          </button>
        </div>
      </aside>

      {/* Mobile bottom navigation — icon-only tab bar for small screens */}
      <nav
        className="
          fixed bottom-0 left-0 right-0 z-50
          flex md:hidden
          bg-[var(--color-surface)] border-t border-[var(--color-border)]
        "
        aria-label="Mobile navigation"
      >
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const href = `/${locale}${item.path}`;
          const isActive =
            pathname === href ||
            (item.path !== '/dashboard' && pathname?.startsWith(href));

          return (
            <Link
              key={item.key}
              href={href}
              className={`
                flex flex-col items-center justify-center flex-1 h-14 gap-0.5
                text-xs font-medium transition-colors
                ${
                  isActive
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-text-secondary)]'
                }
              `}
            >
              <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
              <span className="text-[10px]">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
