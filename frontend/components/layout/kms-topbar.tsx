'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Search, Bell, User, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

/**
 * KMS Topbar — fixed header with logo, global search, and user menu.
 * Rendered as a Client Component because it uses interactive state.
 */
export function KmsTopbar() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const [searchFocused, setSearchFocused] = useState(false);
  const router = useRouter();

  // Ref to the search input so we can programmatically focus it via ⌘K
  const searchInputRef = useRef<HTMLInputElement>(null);

  /**
   * ⌘K / Ctrl+K global shortcut — focuses the topbar search input.
   * Registered once on mount via addEventListener (not via onKeyDown on the
   * input itself) so it fires regardless of which element has focus.
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        // Prevent browser's default ⌘K action (e.g. open link in some browsers)
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select(); // select existing text so user can replace it
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    // Cleanup on unmount to avoid stacking listeners across re-mounts
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  /**
   * Navigate to the search page when the user presses Enter in the topbar.
   * We don't search inline in the topbar — the search page provides the
   * full result list, filters, and highlighted snippets.
   */
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const q = e.currentTarget.value.trim();
      if (q) {
        // Navigate to the dedicated search page with the query in the URL
        router.push(`/${locale}/search?q=${encodeURIComponent(q)}`);
      }
    }
  }

  return (
    <header
      className="
        fixed top-0 left-0 right-0 z-50
        flex items-center justify-between
        h-[var(--topbar-height)] px-4
        bg-[var(--color-surface)] border-b border-[var(--color-border)]
      "
    >
      {/* Left — logo + brand */}
      <div className="flex items-center gap-3 min-w-[200px]">
        <Link
          href={`/${locale}/dashboard`}
          className="flex items-center gap-2 text-[var(--color-text-primary)] hover:opacity-80 transition-opacity"
        >
          {/* Simple KMS wordmark */}
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-[var(--color-accent)]">
            <span className="text-white font-bold text-xs leading-none">KMS</span>
          </div>
          <span className="hidden sm:block font-semibold text-sm tracking-tight">
            Knowledge Base
          </span>
        </Link>
      </div>

      {/* Center — global search */}
      <div className="flex-1 max-w-xl mx-4">
        <div
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
            bg-[var(--color-bg-secondary)] border
            transition-colors duration-150
            ${
              searchFocused
                ? 'border-[var(--color-accent)]'
                : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
            }
          `}
        >
          <Search className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search knowledge base…"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            // Navigate to /search?q=... on Enter — the search page has the full UI
            onKeyDown={handleSearchKeyDown}
            className="
              flex-1 bg-transparent outline-none
              text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]
              text-sm
            "
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border border-[var(--color-border)] text-[var(--color-text-muted)]">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right — notifications + user */}
      <div className="flex items-center gap-1 min-w-[100px] justify-end">
        <button
          type="button"
          aria-label="Notifications"
          className="
            flex items-center justify-center w-8 h-8 rounded-lg
            text-[var(--color-text-secondary)]
            hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]
            transition-colors
          "
        >
          <Bell className="w-4 h-4" />
        </button>

        <button
          type="button"
          aria-label="User menu"
          className="
            flex items-center gap-1.5 px-2 py-1 rounded-lg
            text-[var(--color-text-secondary)]
            hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]
            transition-colors
          "
        >
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[var(--color-accent-muted)]">
            <User className="w-3.5 h-3.5 text-[var(--color-accent)]" />
          </div>
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
    </header>
  );
}
