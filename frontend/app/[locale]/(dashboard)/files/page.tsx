import { Suspense } from 'react';
import { FilesBrowserPage } from '@/components/features/files/FilesBrowserPage';

/**
 * FilesPage — entry point for the /files dashboard route.
 *
 * Suspense is required because FilesBrowserPage uses useSearchParams()
 * to read the ?highlight= param from search result card navigation.
 */
export default function FilesPage() {
  return (
    <Suspense>
      <FilesBrowserPage />
    </Suspense>
  );
}
