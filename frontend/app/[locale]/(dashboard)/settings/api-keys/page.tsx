import type { Metadata } from 'next';
import { ApiKeysFeature } from '@/components/features/settings/ApiKeysFeature';

export const metadata: Metadata = {
  title: 'API Keys — Settings — KMS',
  description: 'Manage your KMS API keys.',
};

/** API Keys settings page — thin shell. All logic lives in ApiKeysFeature. */
export default function ApiKeysPage() {
  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">API Keys</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Manage API keys for programmatic access to the KMS API.
        </p>
      </div>
      <ApiKeysFeature />
    </div>
  );
}
