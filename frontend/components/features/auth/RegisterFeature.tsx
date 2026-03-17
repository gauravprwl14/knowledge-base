'use client';

/**
 * RegisterFeature — wires useRegister hook to the RegisterForm UI.
 *
 * On success: renders "Check your email" confirmation (does NOT auto-login).
 * Backend requires email verification before the account is active.
 */

import { useParams } from 'next/navigation';
import { Mail, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { RegisterForm } from './RegisterForm';
import { useRegister } from '@/lib/hooks/auth/use-register';
import type { RegisterRequest } from '@/lib/types/auth.types';

export function RegisterFeature() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const { mutate, isPending, isError, isSuccess, error } = useRegister();

  const handleSubmit = (data: RegisterRequest) => {
    mutate(data);
  };

  // Success state — show email verification prompt
  if (isSuccess) {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl shadow-black/10 p-8 text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-accent-muted)]">
              <Mail className="w-8 h-8 text-[var(--color-accent)]" aria-hidden="true" />
            </div>
          </div>

          <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
            Check your email
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6 leading-relaxed">
            We&apos;ve sent a verification link to your email address. Click the
            link in the email to activate your account.
          </p>

          <div className="rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] p-4 mb-6 text-left space-y-1.5">
            <p className="text-xs font-medium text-[var(--color-text-secondary)]">
              Didn&apos;t receive the email?
            </p>
            <ul className="text-xs text-[var(--color-text-muted)] space-y-1 list-disc list-inside">
              <li>Check your spam or junk folder</li>
              <li>Make sure you entered the correct email address</li>
              <li>Allow a few minutes for delivery</li>
            </ul>
          </div>

          <Link
            href={`/${locale}/login`}
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
          >
            Go to login
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <RegisterForm
      onSubmit={handleSubmit}
      isLoading={isPending}
      error={error}
      loginHref={`/${locale}/login`}
    />
  );
}
