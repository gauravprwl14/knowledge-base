/**
 * Auth Layout — unauthenticated pages (login, register, forgot password).
 *
 * Structure:
 * - Full-height page with gradient background
 * - KMS logo/brand centered at top
 * - Centered content slot
 * - Copyright footer at bottom
 *
 * No sidebar, no topbar — clean auth experience.
 */

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg-primary)]">
      {/* Subtle gradient overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.15) 0%, transparent 60%)',
        }}
        aria-hidden="true"
      />

      {/* Brand mark — centered at top */}
      <header className="relative z-10 flex justify-center pt-10 pb-6">
        <a
          href="/"
          className="flex items-center gap-2.5 text-[var(--color-text-primary)] hover:opacity-80 transition-opacity"
          aria-label="KMS — Knowledge Base home"
        >
          {/* Logo mark */}
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--color-accent)] shadow-lg shadow-[var(--color-accent)]/20">
            <span className="text-white font-bold text-sm leading-none select-none">
              KMS
            </span>
          </div>
          <span className="font-semibold text-lg tracking-tight">
            Knowledge Base
          </span>
        </a>
      </header>

      {/* Main content — centered */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="relative z-10 flex justify-center pb-8">
        <p className="text-xs text-[var(--color-text-muted)]">
          &copy; {new Date().getFullYear()} Knowledge Base System. All rights
          reserved.
        </p>
      </footer>
    </div>
  );
}
