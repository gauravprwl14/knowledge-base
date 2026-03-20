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
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#0A0A0F] via-[#12091F] to-[#0A0A0F] relative overflow-hidden">
      {/* Ambient orbs — CSS-only, no JS */}
      <div
        className="orb orb-violet fixed w-[600px] h-[600px] -top-48 -left-48"
        aria-hidden="true"
      />
      <div
        className="orb orb-purple fixed w-[500px] h-[500px] top-1/2 -right-48 -translate-y-1/2"
        aria-hidden="true"
      />
      <div
        className="orb orb-cyan fixed w-[400px] h-[400px] -bottom-32 left-1/3"
        aria-hidden="true"
      />

      {/* Subtle dot-grid texture overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
        aria-hidden="true"
      />

      {/* Brand mark — centered at top */}
      <header className="relative z-10 flex justify-center pt-10 pb-6">
        <a
          href="/"
          className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
          aria-label="KMS — Knowledge Base home"
        >
          {/* Logo mark — gradient */}
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 shadow-lg shadow-violet-500/30">
            <span className="text-white font-bold text-sm leading-none select-none">
              K
            </span>
          </div>
          <span className="font-semibold text-lg tracking-tight gradient-text">
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
        <p className="text-xs text-slate-700">
          &copy; {new Date().getFullYear()} Knowledge Base System. All rights
          reserved.
        </p>
      </footer>
    </div>
  );
}
