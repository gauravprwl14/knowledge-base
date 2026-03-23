import { FilesBrowserPage } from '@/components/features/files/FilesBrowserPage';

/**
 * FilesPage — entry point for the /files dashboard route.
 *
 * Delegates all rendering to the FilesBrowserPage client component
 * so that the page itself can remain a Server Component.
 */
export default function FilesPage() {
  return <FilesBrowserPage />;
}
