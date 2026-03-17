'use client';

/**
 * LoginForm — pure UI composite for the login page.
 *
 * Receives all data and handlers via props — no API calls, no store access.
 * Uses react-hook-form + zod for client-side validation.
 */

import { useForm } from 'react-hook-form';
import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LoginRequest } from '@/lib/types/auth.types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface LoginFormProps {
  onSubmit: (data: LoginRequest) => void;
  isLoading: boolean;
  error: string | null;
  onGoogleLogin: () => void;
  /** e.g. "/en/register" */
  registerHref: string;
  forgotPasswordHref?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoginForm({
  onSubmit,
  isLoading,
  error,
  onGoogleLogin,
  registerHref,
  forgotPasswordHref = '#',
}: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitted },
    watch,
  } = useForm<LoginRequest>({
    defaultValues: { email: '', password: '' },
  });

  const emailValue = watch('email');
  const isEmailValid =
    isSubmitted && emailValue
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)
      : null;

  return (
    <div className="w-full max-w-md">
      {/* Card */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl shadow-black/10 p-8">
        {/* Heading */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-1.5">
            Welcome back
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Sign in to your knowledge base
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 mb-6 px-4 py-3 rounded-lg bg-[var(--color-status-error-bg)] border border-[var(--color-status-error)]/20"
          >
            <AlertCircle
              className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-status-error)]"
              aria-hidden="true"
            />
            <p className="text-sm text-[var(--color-status-error)]">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5"
            >
              Email address
            </label>
            <div className="relative">
              <input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                placeholder="you@example.com"
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Enter a valid email address',
                  },
                })}
                className={cn(
                  'w-full h-10 px-3 rounded-lg text-sm outline-none transition-all',
                  'bg-[var(--color-bg-secondary)] border',
                  'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]',
                  'focus:ring-2 focus:ring-[var(--color-accent)]/30',
                  errors.email
                    ? 'border-[var(--color-status-error)] focus:border-[var(--color-status-error)]'
                    : 'border-[var(--color-border)] focus:border-[var(--color-accent)]',
                )}
              />
              {/* Validation indicator dot */}
              {isSubmitted && !errors.email && emailValue && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[var(--color-status-success)]" />
              )}
            </div>
            {errors.email && (
              <p
                id="email-error"
                role="alert"
                className="mt-1.5 text-xs text-[var(--color-status-error)]"
              >
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[var(--color-text-secondary)]"
              >
                Password
              </label>
              <Link
                href={forgotPasswordHref}
                className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                placeholder="••••••••"
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 8,
                    message: 'Password must be at least 8 characters',
                  },
                })}
                className={cn(
                  'w-full h-10 px-3 pr-10 rounded-lg text-sm outline-none transition-all',
                  'bg-[var(--color-bg-secondary)] border',
                  'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]',
                  'focus:ring-2 focus:ring-[var(--color-accent)]/30',
                  errors.password
                    ? 'border-[var(--color-status-error)] focus:border-[var(--color-status-error)]'
                    : 'border-[var(--color-border)] focus:border-[var(--color-accent)]',
                )}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            {errors.password && (
              <p
                id="password-error"
                role="alert"
                className="mt-1.5 text-xs text-[var(--color-status-error)]"
              >
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading}
            className={cn(
              'w-full h-10 rounded-lg text-sm font-semibold transition-all',
              'bg-[var(--color-accent)] text-white',
              'hover:bg-[var(--color-accent-hover)] active:scale-[0.98]',
              'focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/50',
              'disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100',
              'flex items-center justify-center gap-2',
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--color-border)]" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-3 bg-[var(--color-surface)] text-[var(--color-text-muted)]">
              or
            </span>
          </div>
        </div>

        {/* Google OAuth */}
        <button
          type="button"
          onClick={onGoogleLogin}
          disabled={isLoading}
          className={cn(
            'w-full h-10 rounded-lg border border-[var(--color-border)] text-sm font-medium',
            'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]',
            'hover:bg-[var(--color-bg-elevated)] hover:border-[var(--color-border-strong)]',
            'transition-all active:scale-[0.98]',
            'flex items-center justify-center gap-2.5',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          )}
          aria-label="Continue with Google"
        >
          {/* Google SVG icon */}
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M17.64 9.2045C17.64 8.5663 17.5827 7.9527 17.4764 7.3636H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.2045Z"
              fill="#4285F4"
            />
            <path
              d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65591 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z"
              fill="#34A853"
            />
            <path
              d="M3.96409 10.71C3.78409 10.17 3.68182 9.5931 3.68182 9C3.68182 8.4069 3.78409 7.83 3.96409 7.29V4.9582H0.957275C0.347727 6.1732 0 7.5477 0 9C0 10.4523 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.5795C10.3214 3.5795 11.5077 4.0336 12.4405 4.9255L15.0218 2.344C13.4632 0.8918 11.4259 0 9 0C5.48182 0 2.43818 2.0168 0.957275 4.9582L3.96409 7.29C4.67182 5.1627 6.65591 3.5795 9 3.5795Z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        {/* Register link */}
        <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
          Don&apos;t have an account?{' '}
          <Link
            href={registerHref}
            className="font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
          >
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
