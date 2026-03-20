/**
 * Mock data — Tags
 *
 * Four tags owned by user-001. File counts are kept in sync
 * with the file fixture in files.data.ts.
 */

import type { KmsTag } from '@/lib/api/files';

export const MOCK_TAGS: KmsTag[] = [
  {
    id: 'tag-001',
    name: 'Research',
    color: '#6366f1',
    fileCount: 4,
    createdAt: '2025-01-05T08:00:00.000Z',
  },
  {
    id: 'tag-002',
    name: 'Work',
    color: '#10b981',
    fileCount: 5,
    createdAt: '2025-01-06T08:00:00.000Z',
  },
  {
    id: 'tag-003',
    name: 'Personal',
    color: '#f59e0b',
    fileCount: 3,
    createdAt: '2025-01-07T08:00:00.000Z',
  },
  {
    id: 'tag-004',
    name: 'Archive',
    color: '#6b7280',
    fileCount: 2,
    createdAt: '2025-01-08T08:00:00.000Z',
  },
];
