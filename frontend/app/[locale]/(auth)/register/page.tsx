import type { Metadata } from 'next';
import { RegisterFeature } from '@/components/features/auth/RegisterFeature';

export const metadata: Metadata = {
  title: 'Create account — KMS',
  description: 'Create a new Knowledge Base account.',
};

/** Register page — thin shell. All logic lives in RegisterFeature. */
export default function RegisterPage() {
  return <RegisterFeature />;
}
