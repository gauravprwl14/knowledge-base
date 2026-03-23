'use client';

import { AlertCircle, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { useParams } from 'next/navigation';

/**
 * 404 — Not Found (locale-aware)
 *
 * Lives under app/[locale]/ so it renders within the [locale] layout,
 * keeping AuthProvider mounted. Without this, a 404 on a protected route
 * would unmount AuthProvider, causing the Router Cache to serve stale
 * pre-login redirects on the next navigation.
 */
export default function NotFound() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <h1 className="text-9xl font-bold text-[#1a1a1a]">404</h1>
        </div>

        <div className="mb-6 flex justify-center">
          <div className="rounded-full bg-yellow-900/20 p-4">
            <AlertCircle className="h-12 w-12 text-yellow-500" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-100 mb-2">
          Page Not Found
        </h2>

        <p className="text-slate-400 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Link href={'/dashboard' as any}>
            <Button variant="default">
              <Home className="mr-2 h-4 w-4" />
              Go to Dashboard
            </Button>
          </Link>

          <Button onClick={() => window.history.back()} variant="outline">
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
