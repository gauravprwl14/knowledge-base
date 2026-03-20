/**
 * Mock data — Collections
 *
 * Three collections owned by user-001:
 *   col-001 → "My Library"      (default, 4 files)
 *   col-002 → "AI Research"     (4 files, indigo)
 *   col-003 → "Work Projects"   (3 files, emerald)
 *
 * File counts match files.data.ts collectionId assignments.
 */

import type { KmsCollection } from '@/lib/api/collections';

export const MOCK_COLLECTIONS: KmsCollection[] = [
  {
    id: 'col-001',
    name: 'My Library',
    description: 'Default collection for all uncategorised files.',
    color: undefined,
    icon: 'BookOpen',
    isDefault: true,
    fileCount: 4,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-03-20T07:00:00.000Z',
  },
  {
    id: 'col-002',
    name: 'AI Research',
    description: 'Papers, notes, and resources on ML and LLMs.',
    color: '#6366f1',
    icon: 'Cpu',
    isDefault: false,
    fileCount: 4,
    createdAt: '2025-01-15T09:00:00.000Z',
    updatedAt: '2025-03-18T10:00:00.000Z',
  },
  {
    id: 'col-003',
    name: 'Work Projects',
    description: 'Active sprint docs, meeting notes, and roadmaps.',
    color: '#10b981',
    icon: 'Briefcase',
    isDefault: false,
    fileCount: 3,
    createdAt: '2025-01-20T12:00:00.000Z',
    updatedAt: '2025-03-15T10:31:00.000Z',
  },
];
