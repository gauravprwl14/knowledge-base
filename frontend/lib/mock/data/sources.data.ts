/**
 * Mock data — Knowledge Sources
 *
 * Three sources owned by user-001:
 *   src-001 → Google Drive (CONNECTED)
 *   src-002 → Local filesystem (IDLE)
 *   src-003 → Obsidian vault (CONNECTED)
 *
 * Files in files.data.ts reference these IDs via sourceId.
 */

import type { KmsSource } from '@/lib/api/sources';

export const MOCK_SOURCES: KmsSource[] = [
  {
    id: 'src-001',
    userId: 'user-001',
    type: 'GOOGLE_DRIVE',
    status: 'CONNECTED',
    displayName: 'demo@kms.dev — Google Drive',
    externalId: 'demo@kms.dev',
    lastSyncedAt: '2025-03-19T02:00:00.000Z',
    createdAt: '2025-01-10T09:00:00.000Z',
  },
  {
    id: 'src-002',
    userId: 'user-001',
    type: 'LOCAL',
    status: 'IDLE',
    displayName: 'Documents (/home/user/Documents)',
    externalId: null,
    lastSyncedAt: '2025-03-15T10:30:00.000Z',
    createdAt: '2025-01-12T11:00:00.000Z',
  },
  {
    id: 'src-003',
    userId: 'user-001',
    type: 'OBSIDIAN',
    status: 'CONNECTED',
    displayName: 'Personal Vault',
    externalId: null,
    lastSyncedAt: '2025-03-20T07:00:00.000Z',
    createdAt: '2025-02-01T14:00:00.000Z',
  },
];

export type MockScanHistoryItem = {
  id: string;
  status: string;
  startedAt: string;
  completedAt?: string;
};

export const MOCK_SCAN_HISTORY: Record<string, MockScanHistoryItem[]> = {
  'src-001': [
    { id: 'scan-003', status: 'COMPLETED', startedAt: '2025-03-19T02:00:00.000Z', completedAt: '2025-03-19T02:04:22.000Z' },
    { id: 'scan-002', status: 'COMPLETED', startedAt: '2025-03-18T02:00:00.000Z', completedAt: '2025-03-18T02:03:10.000Z' },
    { id: 'scan-001', status: 'COMPLETED', startedAt: '2025-03-17T02:00:00.000Z', completedAt: '2025-03-17T02:05:55.000Z' },
  ],
  'src-002': [
    { id: 'scan-006', status: 'COMPLETED', startedAt: '2025-03-15T10:30:00.000Z', completedAt: '2025-03-15T10:31:08.000Z' },
  ],
  'src-003': [
    { id: 'scan-009', status: 'COMPLETED', startedAt: '2025-03-20T07:00:00.000Z', completedAt: '2025-03-20T07:00:44.000Z' },
    { id: 'scan-008', status: 'COMPLETED', startedAt: '2025-03-19T07:00:00.000Z', completedAt: '2025-03-19T07:00:52.000Z' },
  ],
};
