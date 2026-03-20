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
      className="group flex flex-col gap-3 p-5 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm hover:border-white/20 hover:bg-white/[0.07] transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600/25 to-purple-500/15 border border-violet-500/20">
          <Icon className="text-violet-400" size={18} aria-hidden="true" />
        </div>
        <ArrowRight
          className="w-4 h-4 text-slate-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
          aria-hidden="true"
        />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-100 tabular-nums">
          {value}
        </p>
        <p className="text-sm font-medium text-slate-400 mt-0.5">
          {label}
        </p>
        <p className="text-xs text-slate-600 mt-1">{description}</p>
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
        'inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98]',
        variant === 'primary'
          ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/20'
          : 'border border-white/10 text-slate-300 bg-white/5 hover:bg-white/[0.08] hover:border-white/20',
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
      {/* Welcome banner — gradient */}
      <section
        aria-label="Welcome"
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-violet-600/20 via-purple-600/10 to-transparent p-6"
      >
        {/* Ambient glow */}
        <div
          className="absolute -top-10 -left-10 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%)' }}
          aria-hidden="true"
        />
        <div className="relative">
          <h1 className="text-2xl font-bold text-slate-100">
            {greeting},{' '}
            <span className="gradient-text">{firstName}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Here&apos;s an overview of your knowledge base.
          </p>
        </div>
      </section>

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
        className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-6 rounded-xl border border-violet-500/20 bg-violet-600/10 backdrop-blur-sm"
      >
        <div className="flex-1">
          <h3 className="font-semibold text-slate-200 text-sm mb-1">
            Connect your first source
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Sync Google Drive, upload files, or connect a local folder to start
            building your knowledge base.
          </p>
        </div>
        <Link
          href={`/${locale}/sources`}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/20 transition-all active:scale-[0.98]"
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
            className="font-semibold text-slate-300 text-sm"
          >
            Recent activity
          </h2>
        </div>
        {/* Empty state — premium onboarding card */}
        <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-xl border border-dashed border-white/10 text-center bg-white/[0.02]">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600/20 to-purple-500/10 border border-violet-500/20">
            <Activity
              className="w-6 h-6 text-violet-400"
              aria-hidden="true"
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-300">
              No activity yet
            </p>
            <p className="text-xs text-slate-600 max-w-xs mx-auto leading-relaxed">
              Connect a data source to start indexing your files and building your knowledge base.
            </p>
          </div>
          <Link
            href={`/${locale}/sources`}
            className="text-xs text-violet-400 hover:text-violet-300 inline-flex items-center gap-1 transition-colors mt-1 font-medium"
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
          className="font-semibold text-slate-400 text-xs uppercase tracking-wider mb-4"
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
