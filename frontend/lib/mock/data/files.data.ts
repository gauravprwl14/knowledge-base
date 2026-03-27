/**
 * Mock data — Files
 *
 * Ten files with full relational integrity:
 *   - sourceId  → references MOCK_SOURCES ids (src-001..003)
 *   - collectionId → references MOCK_COLLECTIONS ids (col-001..003)
 *   - tags      → references MOCK_TAGS ids (tag-001..004)
 *
 * Status distribution: 7 INDEXED, 1 PROCESSING, 1 ERROR, 1 PENDING
 */

import type { KmsFile } from '@/lib/api/files';

export const MOCK_FILES: KmsFile[] = [
  // ── Google Drive files (src-001) ─────────────────────────────────────────
  {
    id: 'file-001',
    name: 'transformer-attention-is-all-you-need.pdf',
    path: 'Research Papers/transformer-attention-is-all-you-need.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1_456_789,
    status: 'INDEXED',
    sourceId: 'src-001',
    collectionId: 'col-002',
    tags: [
      { id: 'tag-001', name: 'Research', color: '#6366f1' },
      { id: 'tag-002', name: 'Work', color: '#10b981' },
    ],
    indexedAt: '2025-03-10T11:00:00.000Z',
    createdAt: '2025-03-10T10:55:00.000Z',
    updatedAt: '2025-03-10T11:00:00.000Z',
  },
  {
    id: 'file-002',
    name: 'llm-fundamentals-survey-2024.pdf',
    path: 'Research Papers/llm-fundamentals-survey-2024.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 3_201_456,
    status: 'INDEXED',
    sourceId: 'src-001',
    collectionId: 'col-002',
    tags: [{ id: 'tag-001', name: 'Research', color: '#6366f1' }],
    indexedAt: '2025-03-11T08:20:00.000Z',
    createdAt: '2025-03-11T08:15:00.000Z',
    updatedAt: '2025-03-11T08:20:00.000Z',
  },
  {
    id: 'file-008',
    name: 'annual-budget-2025.xlsx',
    path: 'Finance/annual-budget-2025.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 245_120,
    status: 'PROCESSING',
    sourceId: 'src-001',
    collectionId: 'col-001',
    tags: [
      { id: 'tag-002', name: 'Work', color: '#10b981' },
      { id: 'tag-004', name: 'Archive', color: '#6b7280' },
    ],
    indexedAt: null,
    createdAt: '2025-03-19T06:00:00.000Z',
    updatedAt: '2025-03-19T06:01:00.000Z',
  },
  {
    id: 'file-010',
    name: 'old-architecture-doc-v1.pdf',
    path: 'Archive/old-architecture-doc-v1.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 892_000,
    status: 'ERROR',
    sourceId: 'src-001',
    collectionId: 'col-001',
    tags: [{ id: 'tag-004', name: 'Archive', color: '#6b7280' }],
    indexedAt: null,
    createdAt: '2025-02-28T14:00:00.000Z',
    updatedAt: '2025-02-28T14:05:00.000Z',
  },

  // ── Local filesystem files (src-002) ──────────────────────────────────────
  {
    id: 'file-003',
    name: 'q1-planning-meeting-notes.md',
    path: '/home/user/Documents/Meetings/q1-planning-meeting-notes.md',
    mimeType: 'text/markdown',
    sizeBytes: 8_420,
    status: 'INDEXED',
    sourceId: 'src-002',
    collectionId: 'col-003',
    tags: [{ id: 'tag-002', name: 'Work', color: '#10b981' }],
    indexedAt: '2025-03-15T10:31:00.000Z',
    createdAt: '2025-03-01T09:00:00.000Z',
    updatedAt: '2025-03-15T10:31:00.000Z',
  },
  {
    id: 'file-004',
    name: 'product-roadmap-2025.docx',
    path: '/home/user/Documents/Strategy/product-roadmap-2025.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: 134_500,
    status: 'INDEXED',
    sourceId: 'src-002',
    collectionId: 'col-003',
    tags: [{ id: 'tag-002', name: 'Work', color: '#10b981' }],
    indexedAt: '2025-03-15T10:31:30.000Z',
    createdAt: '2025-02-10T14:00:00.000Z',
    updatedAt: '2025-03-15T10:31:30.000Z',
  },
  {
    id: 'file-007',
    name: 'sprint-17-retrospective.pdf',
    path: '/home/user/Documents/Agile/sprint-17-retrospective.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 420_000,
    status: 'INDEXED',
    sourceId: 'src-002',
    collectionId: 'col-003',
    tags: [{ id: 'tag-002', name: 'Work', color: '#10b981' }],
    indexedAt: '2025-03-15T10:32:00.000Z',
    createdAt: '2025-03-14T17:00:00.000Z',
    updatedAt: '2025-03-15T10:32:00.000Z',
  },

  // ── Obsidian vault files (src-003) ────────────────────────────────────────
  {
    id: 'file-005',
    name: 'personal-journal-march-2025.md',
    path: 'Journal/personal-journal-march-2025.md',
    mimeType: 'text/markdown',
    sizeBytes: 12_800,
    status: 'INDEXED',
    sourceId: 'src-003',
    collectionId: 'col-001',
    tags: [{ id: 'tag-003', name: 'Personal', color: '#f59e0b' }],
    indexedAt: '2025-03-20T07:00:44.000Z',
    createdAt: '2025-03-01T20:00:00.000Z',
    updatedAt: '2025-03-20T07:00:44.000Z',
  },
  {
    id: 'file-006',
    name: 'rag-architecture-notes.md',
    path: 'Tech/rag-architecture-notes.md',
    mimeType: 'text/markdown',
    sizeBytes: 24_600,
    status: 'INDEXED',
    sourceId: 'src-003',
    collectionId: 'col-002',
    tags: [
      { id: 'tag-001', name: 'Research', color: '#6366f1' },
      { id: 'tag-003', name: 'Personal', color: '#f59e0b' },
    ],
    indexedAt: '2025-03-20T07:00:44.000Z',
    createdAt: '2025-02-20T18:00:00.000Z',
    updatedAt: '2025-03-20T07:00:44.000Z',
  },
  {
    id: 'file-009',
    name: 'ideas-and-backlog.md',
    path: 'Projects/ideas-and-backlog.md',
    mimeType: 'text/markdown',
    sizeBytes: 9_100,
    status: 'INDEXED',
    sourceId: 'src-003',
    collectionId: 'col-001',
    tags: [{ id: 'tag-003', name: 'Personal', color: '#f59e0b' }],
    indexedAt: '2025-03-20T07:00:44.000Z',
    createdAt: '2025-03-05T10:00:00.000Z',
    updatedAt: '2025-03-20T07:00:44.000Z',
  },
];
