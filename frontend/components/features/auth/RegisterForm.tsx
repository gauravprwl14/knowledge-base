'use client';

/**
 * RegisterForm — pure UI composite for the registration page.
 *
 * Receives all data and handlers via props — no API calls, no store access.
 * Password strength indicator shows requirements in real-time.
 */

import { useForm, useWatch } from 'react-hook-form';
import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, AlertCircle, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RegisterRequest } from '@/lib/types/auth.types';

// ---------------------------------------------------------------------------
// Form data shape (extends RegisterRequest with UI-only fields)
// ---------------------------------------------------------------------------

interface RegisterFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RegisterFormProps {
  onSubmit: (data: RegisterRequest) => void;
  isLoading: boolean;
  error: string | null;
  /** e.g. "/en/login" */
  loginHref: string;
}

// ---------------------------------------------------------------------------
// Password requirement checks
// ---------------------------------------------------------------------------

interface PasswordRequirement {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  { label: 'One special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

function getPasswordStrength(password: string): number {
  if (!password) return 0;
  return PASSWORD_REQUIREMENTS.filter((r) => r.test(password)).length;
}

function getStrengthColor(strength: number): string {
  if (strength <= 1) return 'bg-red-500';
  if (strength <= 2) return 'bg-amber-500';
  if (strength <= 3) return 'bg-amber-400';
  if (strength <= 4) return 'bg-emerald-500';
  return 'bg-emerald-500';
}

function getStrengthLabel(strength: number): string {
  if (strength <= 1) return 'Weak';
  if (strength <= 2) return 'Fair';
  if (strength <= 3) return 'Good';
  if (strength <= 4) return 'Strong';
  return 'Very strong';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RegisterForm({
  onSubmit,
  isLoading,
  error,
  loginHref,
}: RegisterFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    getValues,
  } = useForm<RegisterFormData>({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
    },
  });

  const passwordValue = useWatch({ control, name: 'password' });
  const strength = getPasswordStrength(passwordValue ?? '');
  const strengthWidth = passwordValue
    ? `${(strength / PASSWORD_REQUIREMENTS.length) * 100}%`
    : '0%';

  const handleFormSubmit = (data: RegisterFormData) => {
    onSubmit({
      email: data.email,
      password: data.password,
      name: `${data.firstName.trim()} ${data.lastName.trim()}`.trim(),
    });
  };

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl shadow-black/40 p-8">
        {/* Heading */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-100 mb-1.5">
            Create your account
          </h1>
          <p className="text-sm text-slate-500">
            Start managing your knowledge base today
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20"
          >
            <AlertCircle
              className="w-4 h-4 shrink-0 mt-0.5 text-red-400"
              aria-hidden="true"
            />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          noValidate
          className="space-y-5"
        >
          {/* First + Last name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="firstName"
                className="block text-sm font-medium text-slate-400 mb-1.5"
              >
                First name
              </label>
              <input
                id="firstName"
                type="text"
                autoComplete="given-name"
                aria-invalid={!!errors.firstName}
                placeholder="Jane"
                {...register('firstName', {
                  required: 'Required',
                  minLength: { value: 1, message: 'Required' },
                })}
                className={cn(
                  'w-full h-10 px-3 rounded-lg text-sm outline-none transition-all',
                  'bg-white/5 border',
                  'text-slate-200 placeholder:text-slate-600',
                  'focus:ring-2 focus:ring-blue-400/20',
                  errors.firstName
                    ? 'border-red-500/50 focus:border-red-500/70'
                    : 'border-white/10 focus:border-blue-400/60',
                )}
              />
              {errors.firstName && (
                <p className="mt-1 text-xs text-red-400">
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="lastName"
                className="block text-sm font-medium text-slate-400 mb-1.5"
              >
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                autoComplete="family-name"
                aria-invalid={!!errors.lastName}
                placeholder="Doe"
                {...register('lastName', { required: 'Required' })}
                className={cn(
                  'w-full h-10 px-3 rounded-lg text-sm outline-none transition-all',
                  'bg-white/5 border',
                  'text-slate-200 placeholder:text-slate-600',
                  'focus:ring-2 focus:ring-blue-400/20',
                  errors.lastName
                    ? 'border-red-500/50 focus:border-red-500/70'
                    : 'border-white/10 focus:border-blue-400/60',
                )}
              />
              {errors.lastName && (
                <p className="mt-1 text-xs text-red-400">
                  {errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-400 mb-1.5"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
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
                'bg-white/5 border',
                'text-slate-200 placeholder:text-slate-600',
                'focus:ring-2 focus:ring-blue-400/20',
                errors.email
                  ? 'border-red-500/50 focus:border-red-500/70'
                  : 'border-white/10 focus:border-blue-400/60',
              )}
            />
            {errors.email && (
              <p className="mt-1.5 text-xs text-red-400">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-400 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                placeholder="Create a strong password"
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 8,
                    message: 'Password must be at least 8 characters',
                  },
                })}
                className={cn(
                  'w-full h-10 px-3 pr-10 rounded-lg text-sm outline-none transition-all',
                  'bg-white/5 border',
                  'text-slate-200 placeholder:text-slate-600',
                  'focus:ring-2 focus:ring-blue-400/20',
                  errors.password
                    ? 'border-red-500/50 focus:border-red-500/70'
                    : 'border-white/10 focus:border-blue-400/60',
                )}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Strength bar */}
            {passwordValue && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        getStrengthColor(strength),
                      )}
                      style={{ width: strengthWidth }}
                    />
                  </div>
                  <span className="text-xs text-slate-600 w-16 text-right">
                    {getStrengthLabel(strength)}
                  </span>
                </div>
                {/* Requirements list */}
                <ul className="grid grid-cols-1 gap-1" aria-label="Password requirements">
                  {PASSWORD_REQUIREMENTS.map((req) => {
                    const met = req.test(passwordValue);
                    return (
                      <li
                        key={req.label}
                        className={cn(
                          'flex items-center gap-1.5 text-xs',
                          met
                            ? 'text-emerald-500'
                            : 'text-slate-600',
                        )}
                      >
                        {met ? (
                          <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
                        ) : (
                          <X className="w-3 h-3 shrink-0" aria-hidden="true" />
                        )}
                        {req.label}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {errors.password && (
              <p className="mt-1.5 text-xs text-red-400">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-slate-400 mb-1.5"
            >
              Confirm password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                placeholder="Repeat your password"
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: (value) =>
                    value === getValues('password') || 'Passwords do not match',
                })}
                className={cn(
                  'w-full h-10 px-3 pr-10 rounded-lg text-sm outline-none transition-all',
                  'bg-white/5 border',
                  'text-slate-200 placeholder:text-slate-600',
                  'focus:ring-2 focus:ring-blue-400/20',
                  errors.confirmPassword
                    ? 'border-red-500/50 focus:border-red-500/70'
                    : 'border-white/10 focus:border-blue-400/60',
                )}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
              >
                {showConfirm ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="mt-1.5 text-xs text-red-400">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          {/* Terms */}
          <div className="flex items-start gap-3">
            <input
              id="acceptTerms"
              type="checkbox"
              aria-invalid={!!errors.acceptTerms}
              {...register('acceptTerms', {
                required: 'You must accept the terms to continue',
              })}
              className="mt-0.5 w-4 h-4 rounded border-white/10 accent-blue-500 cursor-pointer"
            />
            <label
              htmlFor="acceptTerms"
              className="text-sm text-slate-400 leading-snug cursor-pointer"
            >
              I agree to the{' '}
              <a
                href="/terms"
                className="text-[#93c5fd] hover:text-[#60a5fa] underline-offset-2 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms of Service
              </a>{' '}
              and{' '}
              <a
                href="/privacy"
                className="text-[#93c5fd] hover:text-[#60a5fa] underline-offset-2 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </a>
            </label>
          </div>
          {errors.acceptTerms && (
            <p className="-mt-3 text-xs text-red-400">
              {errors.acceptTerms.message}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading}
            className={cn(
              'w-full h-10 rounded-lg text-sm font-semibold transition-all',
              'bg-[#3b82f6] hover:bg-[#2563eb]',
              'text-white',
              'active:scale-[0.98]',
              'focus-visible:ring-2 focus-visible:ring-blue-400/50',
              'disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100',
              'flex items-center justify-center gap-2',
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating account…
              </>
            ) : (
              'Create account'
            )}
          </button>
        </form>

        {/* Login link */}
        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link
            href={loginHref}
            className="font-medium text-[#93c5fd] hover:text-[#60a5fa] transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
