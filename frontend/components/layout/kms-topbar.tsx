'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Search, Bell, User, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export function KmsTopbar() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const [searchFocused, setSearchFocused] = useState(false);
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const q = e.currentTarget.value.trim();
      if (q) router.push(`/${locale}/search?q=${encodeURIComponent(q)}`);
    }
  }

  return (
    <header
      className="
        fixed top-0 left-0 right-0 z-50
        flex items-center justify-between
        h-[var(--topbar-height)] px-4
        bg-[#111111]/95 backdrop-blur-xl border-b border-[#2e2e2e]
      "
    >
      {/* Logo */}
      <div className="flex items-center gap-3 min-w-[200px]">
        <Link
          href={`/${locale}/dashboard`}
          className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
        >
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-[#3b82f6] shadow-sm">
            <span className="text-white font-bold text-xs leading-none">K</span>
          </div>
          <span className="hidden sm:block font-semibold text-sm text-[#fafafa] tracking-tight">
            Knowledge Base
          </span>
        </Link>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-xl mx-4">
        <div
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
            bg-[#1c1c1c] border transition-all duration-150
            ${searchFocused
              ? 'border-[#93c5fd]/50 shadow-[0_0_0_3px_rgba(147,197,253,0.08)]'
              : 'border-[#2e2e2e] hover:border-[#404040]'
            }
          `}
        >
          <Search className="w-3.5 h-3.5 text-[#525252] shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search knowledge base…"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={handleSearchKeyDown}
            className="flex-1 bg-transparent outline-none text-[#d4d4d4] placeholder:text-[#525252] text-sm"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border border-[#2e2e2e] text-[#525252]">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 min-w-[100px] justify-end">
        <button
          type="button"
          aria-label="Notifications"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-[#525252] hover:bg-white/[0.04] hover:text-[#a1a1a1] transition-colors"
        >
          <Bell className="w-4 h-4" />
        </button>

        <button
          type="button"
          aria-label="User menu"
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[#a1a1a1] hover:bg-white/[0.04] hover:text-[#fafafa] transition-colors"
        >
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#1c1c1c] border border-[#2e2e2e]">
            <User className="w-3.5 h-3.5 text-[#93c5fd]" />
          </div>
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
    </header>
  );
}
