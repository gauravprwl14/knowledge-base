/**
 * Mock handler — Collections API
 *
 * Matches the exact shape of `collectionsApi` in lib/api/collections.ts.
 * Maintains fileCount in sync with add/remove file operations.
 *
 * Swap: set NEXT_PUBLIC_USE_MOCK=true in .env.local.
 */

import { MOCK_COLLECTIONS } from '../data/collections.data';
import type { KmsCollection, CreateCollectionPayload } from '@/lib/api/collections';

let _collections: KmsCollection[] = [...MOCK_COLLECTIONS];

const delay = (ms = 200) => new Promise<void>((r) => setTimeout(r, ms));

export const mockCollectionsApi = {
  async list(): Promise<KmsCollection[]> {
    await delay(200);
    return [..._collections];
  },

  async get(id: string): Promise<KmsCollection> {
    await delay(150);
    const col = _collections.find((c) => c.id === id);
    if (!col) throw new Error(`Collection not found: ${id}`);
    return col;
  },

  async create(payload: CreateCollectionPayload): Promise<KmsCollection> {
    await delay(300);
    const col: KmsCollection = {
      id: `col-${Date.now()}`,
      name: payload.name,
      description: payload.description,
      color: payload.color,
      icon: payload.icon,
      isDefault: false,
      fileCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    _collections = [..._collections, col];
    return col;
  },

  async update(id: string, payload: Partial<CreateCollectionPayload>): Promise<KmsCollection> {
    await delay(200);
    _collections = _collections.map((c) =>
      c.id === id ? { ...c, ...payload, updatedAt: new Date().toISOString() } : c,
    );
    const col = _collections.find((c) => c.id === id);
    if (!col) throw new Error(`Collection not found: ${id}`);
    return col;
  },

  async delete(id: string): Promise<void> {
    await delay(250);
    const col = _collections.find((c) => c.id === id);
    if (col?.isDefault) throw new Error('Cannot delete the default collection');
    _collections = _collections.filter((c) => c.id !== id);
  },

  async addFiles(collectionId: string, fileIds: string[]): Promise<void> {
    await delay(250);
    _collections = _collections.map((c) =>
      c.id === collectionId
        ? { ...c, fileCount: c.fileCount + fileIds.length, updatedAt: new Date().toISOString() }
        : c,
    );
  },

  async removeFile(collectionId: string, _fileId: string): Promise<void> {
    await delay(200);
    _collections = _collections.map((c) =>
      c.id === collectionId
        ? { ...c, fileCount: Math.max(0, c.fileCount - 1), updatedAt: new Date().toISOString() }
        : c,
    );
  },

  async removeFiles(collectionId: string, fileIds: string[]): Promise<void> {
    await delay(250);
    _collections = _collections.map((c) =>
      c.id === collectionId
        ? { ...c, fileCount: Math.max(0, c.fileCount - fileIds.length), updatedAt: new Date().toISOString() }
        : c,
    );
  },
};
