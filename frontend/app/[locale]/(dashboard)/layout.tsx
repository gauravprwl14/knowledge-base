'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, Cloud, Search, FileText, Link2, FileCode } from 'lucide-react';

const navItems = [
  { icon: Home, label: 'Dashboard', href: '/en/dashboard', key: 'dashboard' },
  { icon: FileText, label: 'Transcribe', href: '/en/transcribe', key: 'transcribe' },
  { icon: BookOpen, label: 'Knowledge', href: '/en/knowledge', key: 'knowledge' },
  { icon: Cloud, label: 'Drive', href: '/en/drive', key: 'drive' },
  { icon: Search, label: 'Search', href: '/en/search', key: 'search' },
  { icon: Link2, label: 'Bookmarks', href: '/en/bookmarks', key: 'bookmarks' },
  { icon: FileCode, label: 'Prompts', href: '/en/prompts', key: 'prompts' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations('Navigation');
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 border-b bg-dark-surface border-dark-border">
        <div className="flex items-center justify-between h-16 px-4">
          <Link href="/en/dashboard" className="text-xl font-bold text-text-primary">
            Voice App
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden gap-1 md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname?.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    isActive
                      ? 'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors bg-primary-400/10 text-primary-400'
                      : 'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-text-secondary hover:text-text-primary hover:bg-dark-surfaceHover'
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{t(item.key)}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-16">
        <div className="px-4 py-8 mx-auto max-w-7xl md:px-6">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t md:hidden bg-dark-surface border-dark-border">
        <div className="flex items-center justify-around h-16">
          {navItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const isActive = pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  isActive
                    ? 'flex flex-col items-center justify-center flex-1 h-full min-w-[44px] text-primary-400'
                    : 'flex flex-col items-center justify-center flex-1 h-full min-w-[44px] text-text-secondary'
                }
              >
                <Icon className="w-6 h-6" />
                <span className="mt-1 text-xs">{t(item.key)}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom padding for mobile nav */}
      <div className="h-16 md:hidden" />
    </div>
  );
}
