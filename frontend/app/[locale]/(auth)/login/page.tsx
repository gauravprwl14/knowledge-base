import type { Metadata } from 'next';
import { LoginFeature } from '@/components/features/auth/LoginFeature';

export const metadata: Metadata = {
  title: 'Sign in — KMS',
  description: 'Sign in to your Knowledge Base account.',
};

/** Login page — thin shell. All logic lives in LoginFeature. */
export default function LoginPage() {
  return <LoginFeature />;
}
