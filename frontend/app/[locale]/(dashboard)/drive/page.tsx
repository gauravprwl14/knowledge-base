/**
 * Sources page — lists all connected knowledge sources (Google Drive, Obsidian,
 * Local folders) and allows connecting new ones.
 *
 * This is a Server Component shell. All interactive content is delegated to
 * DriveSourcesClient (a Client Component) so that hooks and mutations work.
 */
import { DriveSourcesClient } from '@/components/features/sources/DriveSourcesClient';

export const metadata = {
  title: 'Sources — KMS',
  description: 'Manage your connected knowledge sources: Obsidian vaults, Google Drive, and local folders',
};

export default function SourcesPage() {
  return (
    <div className="p-6 md:p-8">
      <DriveSourcesClient />
    </div>
  );
}
