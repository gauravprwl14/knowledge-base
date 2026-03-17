'use client';

/**
 * Dashboard Home Page
 *
 * Shows greeting, quick stats, recent activity, and quick actions.
 * Uses useCurrentUser() to read user from the store (no extra API call needed
 * — AuthProvider already hydrated the store on mount).
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Database,
  Files,
  Search,
  FolderOpen,
  CloudUpload,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/lib/stores/auth.store';

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  description: string;
  href: string;
}

function StatCard({ icon: Icon, label, value, description, href }: StatCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-raised)] transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-accent-muted)]">
          <Icon className="text-[var(--color-accent)]" size={18} aria-hidden="true" />
        </div>
        <ArrowRight
          className="w-4 h-4 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
          aria-hidden="true"
        />
      </div>
      <div>
        <p className="text-2xl font-bold text-[var(--color-text-primary)] tabular-nums">
          {value}
        </p>
        <p className="text-sm font-medium text-[var(--color-text-secondary)] mt-0.5">
          {label}
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">{description}</p>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Quick action button
// ---------------------------------------------------------------------------

interface QuickActionProps {
  icon: React.ElementType;
  label: string;
  href: string;
  variant?: 'primary' | 'secondary';
}

function QuickAction({ icon: Icon, label, href, variant = 'secondary' }: QuickActionProps) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
        variant === 'primary'
          ? 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]'
          : 'border border-[var(--color-border)] text-[var(--color-text-primary)] bg-[var(--color-surface)] hover:bg-[var(--color-bg-secondary)] hover:border-[var(--color-border-strong)]',
      )}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const user = useCurrentUser();
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const stats: StatCardProps[] = [
    {
      icon: Database,
      label: 'Sources connected',
      value: '—',
      description: 'Connect your first data source',
      href: `/${locale}/sources`,
    },
    {
      icon: Files,
      label: 'Files indexed',
      value: 0,
      description: 'Files ready for search',
      href: `/${locale}/files`,
    },
    {
      icon: Search,
      label: 'Recent searches',
      value: '—',
      description: 'Search across your knowledge base',
      href: `/${locale}/search`,
    },
    {
      icon: FolderOpen,
      label: 'Collections',
      value: 0,
      description: 'Organize files into collections',
      href: `/${locale}/collections`,
    },
  ];

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
          {greeting}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Here&apos;s an overview of your knowledge base.
        </p>
      </div>

      {/* Stats grid */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Quick stats
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section
        aria-label="Get started"
        className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-6 rounded-xl border border-[var(--color-accent)]/20 bg-[var(--color-accent-muted)]"
      >
        <div className="flex-1">
          <h3 className="font-semibold text-[var(--color-text-primary)] text-sm mb-1">
            Connect your first source
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Sync Google Drive, upload files, or connect a local folder to start
            building your knowledge base.
          </p>
        </div>
        <Link
          href={`/${locale}/sources`}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          <Database className="w-4 h-4" aria-hidden="true" />
          Connect a source
        </Link>
      </section>

      {/* Recent activity */}
      <section aria-labelledby="activity-heading">
        <div className="flex items-center justify-between mb-4">
          <h2
            id="activity-heading"
            className="font-semibold text-[var(--color-text-primary)] text-sm"
          >
            Recent activity
          </h2>
        </div>
        {/* Empty state */}
        <div className="flex flex-col items-center justify-center gap-3 py-14 rounded-xl border border-dashed border-[var(--color-border)] text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-bg-secondary)]">
            <Activity
              className="w-5 h-5 text-[var(--color-text-muted)]"
              aria-hidden="true"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">
              No activity yet
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Your recent actions will appear here
            </p>
          </div>
          <Link
            href={`/${locale}/sources`}
            className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] inline-flex items-center gap-1 transition-colors mt-1"
          >
            Connect your first source
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Quick actions */}
      <section aria-labelledby="actions-heading">
        <h2
          id="actions-heading"
          className="font-semibold text-[var(--color-text-primary)] text-sm mb-4"
        >
          Quick actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <QuickAction
            icon={CloudUpload}
            label="Connect Google Drive"
            href={`/${locale}/drive`}
            variant="primary"
          />
          <QuickAction
            icon={Search}
            label="Search"
            href={`/${locale}/search`}
          />
          <QuickAction
            icon={Files}
            label="Upload file"
            href={`/${locale}/transcribe`}
          />
        </div>
      </section>
    </div>
  );
}
