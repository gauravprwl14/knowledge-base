/**
 * Drive page — lists connected Google Drive sources and allows connecting new ones.
 *
 * This is a Server Component shell. All interactive content is delegated to
 * DriveSourcesClient (a Client Component) so that hooks and mutations work.
 */
import { DriveSourcesClient } from '@/components/features/sources/DriveSourcesClient';

export const metadata = {
  title: 'Google Drive — KMS',
  description: 'Manage your connected Google Drive knowledge sources',
};

export default function DrivePage() {
  return (
    <div className="p-6 md:p-8">
      <DriveSourcesClient />
    </div>
  );
}
