'use client';

import { JunkPage } from '@/components/features/junk/JunkPage';

/**
 * /junk — shows files that failed processing (status=ERROR) or were
 * flagged as low-quality, with delete/retry and bulk-delete actions.
 */
export default function JunkRoute() {
  return <JunkPage />;
}
