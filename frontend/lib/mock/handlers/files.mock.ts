/**
 * Mock handler — Files & Tags API
 *
 * Matches the exact shapes of `filesApi` and `tagsApi` in lib/api/files.ts.
 * In-memory state — create/delete/update mutations are reflected immediately
 * within the session (resets on page reload).
 *
 * Swap: set NEXT_PUBLIC_USE_MOCK=true in .env.local.
 */

import { MOCK_FILES } from '../data/files.data';
import { MOCK_TAGS } from '../data/tags.data';
import type {
  KmsFile,
  KmsTag,
  ListFilesParams,
  ListFilesResponse,
  TranscriptionStatus,
} from '@/lib/api/files';

// ── In-memory state ──────────────────────────────────────────────────────────

let _files: KmsFile[] = [...MOCK_FILES];
let _tags: KmsTag[] = [...MOCK_TAGS];

const delay = (ms = 200) => new Promise<void>((r) => setTimeout(r, ms));

// ── filesApi mock ────────────────────────────────────────────────────────────

export const mockFilesApi = {
  async list(params: ListFilesParams = {}): Promise<ListFilesResponse> {
    await delay(250);

    let result = [..._files];

    // Filter
    if (params.sourceId) result = result.filter((f) => f.sourceId === params.sourceId);
    if (params.collectionId) result = result.filter((f) => f.collectionId === params.collectionId);
    if (params.status) result = result.filter((f) => f.status === params.status);
    if (params.mimeGroup) {
      result = result.filter((f) => {
        const m = f.mimeType;
        if (params.mimeGroup === 'document')
          return m.includes('pdf') || m.includes('word') || m.includes('text') || m.includes('markdown');
        if (params.mimeGroup === 'spreadsheet') return m.includes('sheet') || m.includes('excel');
        if (params.mimeGroup === 'image') return m.startsWith('image/');
        if (params.mimeGroup === 'audio') return m.startsWith('audio/');
        if (params.mimeGroup === 'video') return m.startsWith('video/');
        return true;
      });
    }
    if (params.tags?.length) {
      result = result.filter((f) =>
        params.tags!.every((tagName) => f.tags.some((t) => t.name === tagName)),
      );
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(q));
    }

    // Sort
    const sortBy = params.sortBy ?? 'createdAt';
    const sortDir = params.sortDir ?? 'desc';
    result.sort((a, b) => {
      const av = String(a[sortBy as keyof KmsFile] ?? '');
      const bv = String(b[sortBy as keyof KmsFile] ?? '');
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    // Cursor pagination (simplified: treat cursor as offset string)
    const pageSize = params.limit ?? 20;
    const offset = params.cursor ? parseInt(params.cursor, 10) : 0;
    const page = result.slice(offset, offset + pageSize);
    const nextCursor = offset + pageSize < result.length ? String(offset + pageSize) : undefined;

    return { items: page, nextCursor, total: result.length };
  },

  async get(id: string): Promise<KmsFile> {
    await delay(150);
    const file = _files.find((f) => f.id === id);
    if (!file) throw new Error(`File not found: ${id}`);
    return file;
  },

  async delete(id: string): Promise<void> {
    await delay(300);
    _files = _files.filter((f) => f.id !== id);
    // Update fileCount on affected tags
    _tags = _tags.map((t) => ({ ...t, fileCount: _files.filter((f) => f.tags.some((ft) => ft.id === t.id)).length }));
  },

  async bulkDelete(ids: string[]): Promise<{ deleted: number }> {
    await delay(400);
    const before = _files.length;
    _files = _files.filter((f) => !ids.includes(f.id));
    _tags = _tags.map((t) => ({ ...t, fileCount: _files.filter((f) => f.tags.some((ft) => ft.id === t.id)).length }));
    return { deleted: before - _files.length };
  },

  async bulkReEmbed(ids: string[]): Promise<{ queued: number }> {
    await delay(300);
    let queued = 0;
    _files = _files.map((f) => {
      if (ids.includes(f.id)) {
        queued++;
        return { ...f, status: 'PENDING' as const, embeddingStatus: 'pending' as const };
      }
      return f;
    });
    return { queued };
  },

  async retry(id: string): Promise<void> {
    await delay(300);
    const file = _files.find((f) => f.id === id);
    if (!file) throw new Error(`File not found: ${id}`);
    _files = _files.map((f) => (f.id === id ? { ...f, status: 'PENDING' } : f));
  },

  async getTranscription(fileId: string): Promise<TranscriptionStatus | null> {
    await delay(150);
    const file = _files.find((f) => f.id === fileId);
    if (!file) return null;
    // Only return a mock job for audio/video files
    if (!file.mimeType.startsWith('audio/') && !file.mimeType.startsWith('video/')) {
      return null;
    }
    return {
      id: `transcription-${fileId}`,
      status: 'COMPLETED',
      language: 'en',
      durationSeconds: 123,
      completedAt: file.indexedAt ?? file.createdAt,
      errorMsg: null,
      modelUsed: 'whisper-large-v3',
      createdAt: file.createdAt,
    };
  },
};

// ── tagsApi mock ─────────────────────────────────────────────────────────────

export const mockTagsApi = {
  async list(): Promise<KmsTag[]> {
    await delay(180);
    return [..._tags];
  },

  async create(name: string, color: string): Promise<KmsTag> {
    await delay(250);
    // Guard: name uniqueness (mirror the real P2002 behavior)
    if (_tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      const err: Error & { code?: string } = new Error('Tag name already exists');
      err.code = 'P2002';
      throw err;
    }
    const tag: KmsTag = {
      id: `tag-${Date.now()}`,
      name,
      color,
      fileCount: 0,
      createdAt: new Date().toISOString(),
    };
    _tags = [..._tags, tag];
    return tag;
  },

  async update(id: string, payload: Partial<{ name: string; color: string }>): Promise<KmsTag> {
    await delay(200);
    _tags = _tags.map((t) => (t.id === id ? { ...t, ...payload } : t));
    // Sync tag name/color inside file tag arrays
    if (payload.name || payload.color) {
      _files = _files.map((f) => ({
        ...f,
        tags: f.tags.map((ft) =>
          ft.id === id ? { ...ft, ...(payload.name && { name: payload.name }), ...(payload.color && { color: payload.color }) } : ft,
        ),
      }));
    }
    const tag = _tags.find((t) => t.id === id);
    if (!tag) throw new Error(`Tag not found: ${id}`);
    return tag;
  },

  async delete(id: string): Promise<void> {
    await delay(250);
    _tags = _tags.filter((t) => t.id !== id);
    // Remove tag from all files
    _files = _files.map((f) => ({ ...f, tags: f.tags.filter((ft) => ft.id !== id) }));
  },

  async addToFile(fileId: string, tagId: string): Promise<void> {
    await delay(150);
    const tag = _tags.find((t) => t.id === tagId);
    if (!tag) throw new Error(`Tag not found: ${tagId}`);
    _files = _files.map((f) => {
      if (f.id !== fileId || f.tags.some((ft) => ft.id === tagId)) return f;
      return { ...f, tags: [...f.tags, { id: tag.id, name: tag.name, color: tag.color }] };
    });
    _tags = _tags.map((t) =>
      t.id === tagId ? { ...t, fileCount: _files.filter((f) => f.tags.some((ft) => ft.id === tagId)).length } : t,
    );
  },

  async removeFromFile(fileId: string, tagId: string): Promise<void> {
    await delay(150);
    _files = _files.map((f) =>
      f.id === fileId ? { ...f, tags: f.tags.filter((ft) => ft.id !== tagId) } : f,
    );
    _tags = _tags.map((t) =>
      t.id === tagId ? { ...t, fileCount: _files.filter((f) => f.tags.some((ft) => ft.id === tagId)).length } : t,
    );
  },

  async bulkTag(fileIds: string[], tagId: string): Promise<void> {
    await delay(300);
    const tag = _tags.find((t) => t.id === tagId);
    if (!tag) throw new Error(`Tag not found: ${tagId}`);
    _files = _files.map((f) => {
      if (!fileIds.includes(f.id) || f.tags.some((ft) => ft.id === tagId)) return f;
      return { ...f, tags: [...f.tags, { id: tag.id, name: tag.name, color: tag.color }] };
    });
    _tags = _tags.map((t) =>
      t.id === tagId ? { ...t, fileCount: _files.filter((f) => f.tags.some((ft) => ft.id === tagId)).length } : t,
    );
  },
};
