'use client';

import { Link, usePathname } from '@/i18n/routing';
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

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  key: string;
}

const NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard',   path: '/dashboard',   key: 'dashboard'   },
  { icon: Database,        label: 'Sources',     path: '/sources',     key: 'sources'     },
  { icon: Files,           label: 'Files',       path: '/files',       key: 'files'       },
  { icon: Search,          label: 'Search',      path: '/search',      key: 'search'      },
  { icon: Copy,            label: 'Duplicates',  path: '/duplicates',  key: 'duplicates'  },
  { icon: Trash2,          label: 'Junk',        path: '/junk',        key: 'junk'        },
  { icon: GitGraph,        label: 'Graph',       path: '/graph',       key: 'graph'       },
  { icon: MessageSquare,   label: 'Chat',        path: '/chat',        key: 'chat'        },
  { icon: Mic,             label: 'Transcribe',  path: '/transcribe',  key: 'transcribe'  },
  { icon: FolderOpen,      label: 'Collections', path: '/collections', key: 'collections' },
  { icon: Settings,        label: 'Settings',    path: '/settings',    key: 'settings'    },
];

export function KmsSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const toggle = useCallback(() => setCollapsed((v) => !v), []);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        style={{ width: collapsed ? '56px' : 'var(--sidebar-width)' }}
        className="
          fixed left-0 top-[var(--topbar-height)] bottom-0 z-40
          flex flex-col
          bg-[#111111] border-r border-[#2e2e2e]
          kms-sidebar-transition hidden md:flex
        "
      >
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
          <ul className="flex flex-col gap-0.5 px-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const href = item.path;
              const isActive =
                pathname === href ||
                (item.path !== '/dashboard' && pathname?.startsWith(href));

              return (
                <li key={item.key}>
                  <Link
                    href={href}
                    title={collapsed ? item.label : undefined}
                    className={`
                      relative flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium
                      transition-all duration-150
                      ${
                        isActive
                          ? 'bg-[#93c5fd]/10 text-[#93c5fd] border-l-2 border-[#93c5fd] pl-[9px]'
                          : 'text-[#a1a1a1] hover:bg-white/[0.04] hover:text-[#fafafa] border-l-2 border-transparent pl-[9px]'
                      }
                      ${collapsed ? 'justify-center' : ''}
                    `}
                  >
                    <Icon
                      className={`shrink-0 ${isActive ? 'text-[#93c5fd]' : 'text-[#525252]'}`}
                      size={20}
                      strokeWidth={isActive ? 2 : 1.5}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-[#2e2e2e] p-2">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="
              flex items-center justify-center w-full h-8 rounded-lg
              text-[#525252] hover:bg-white/[0.04] hover:text-[#a1a1a1]
              transition-colors
            "
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav
        className="
          fixed bottom-0 left-0 right-0 z-50 flex md:hidden
          bg-[#111111]/95 backdrop-blur-xl border-t border-[#2e2e2e]
        "
        aria-label="Mobile navigation"
      >
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const href = item.path;
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
                ${isActive ? 'text-[#93c5fd]' : 'text-[#525252]'}
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
