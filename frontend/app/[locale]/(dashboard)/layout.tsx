/**
 * KMS Dashboard Layout — Server Component
 *
 * Shell structure:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  Topbar (fixed, h-[--topbar-height])                     │
 *   ├────────────┬─────────────────────────────────────────────┤
 *   │  Sidebar   │  Main content (scrollable)                  │
 *   │  (fixed,   │                                             │
 *   │   w-60)    │                                             │
 *   └────────────┴─────────────────────────────────────────────┘
 *
 * Interactive parts (Topbar, Sidebar) are extracted as 'use client' components.
 * This layout itself is a Server Component — no 'use client' directive.
 */

import { KmsTopbar } from '@/components/layout/kms-topbar';
import { KmsSidebar } from '@/components/layout/kms-sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Fixed topbar — spans full width above sidebar and content */}
      <KmsTopbar />

      {/* Fixed sidebar — below topbar, left column */}
      <KmsSidebar />

      {/*
       * Main content area
       * - pt-[topbar-height]: clears the fixed topbar
       * - md:pl-[sidebar-width]: clears the fixed sidebar on desktop
       * - pb-14 md:pb-0: clears mobile bottom nav bar
       */}
      <main
        className="
          pt-[var(--topbar-height)]
          md:pl-[var(--sidebar-width)]
          pb-14 md:pb-0
          min-h-screen
          kms-sidebar-transition
        "
      >
        <div className="h-full overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
