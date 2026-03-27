/**
 * Mock handler — Sources API
 *
 * Matches the exact shapes of `kmsSourcesApi` and `localSourcesApi`
 * in lib/api/sources.ts, plus the scan/scan-history methods.
 *
 * Swap: set NEXT_PUBLIC_USE_MOCK=true in .env.local.
 */

import { MOCK_SOURCES, MOCK_SCAN_HISTORY } from '../data/sources.data';
import type { KmsSource, ScanHistoryItem, DriveFolder, DisconnectResult, ClearJobStatus } from '@/lib/api/sources';

let _sources: KmsSource[] = [...MOCK_SOURCES];

const delay = (ms = 200) => new Promise<void>((r) => setTimeout(r, ms));

export const mockKmsSourcesApi = {
  async list(): Promise<KmsSource[]> {
    await delay(250);
    return [..._sources];
  },

  async get(id: string): Promise<KmsSource> {
    await delay(150);
    const src = _sources.find((s) => s.id === id);
    if (!src) throw new Error(`Source not found: ${id}`);
    return src;
  },

  async disconnect(id: string, clearData = false): Promise<DisconnectResult> {
    await delay(300);
    _sources = _sources.map((s) =>
      s.id === id ? { ...s, status: 'DISCONNECTED' as const } : s,
    );
    if (clearData) {
      console.info('[mock] clearData=true — simulating async clear job');
      return { jobId: `clear-mock-${Date.now()}` };
    }
    return {};
  },

  async getClearStatus(_id: string): Promise<ClearJobStatus | null> {
    await delay(200);
    return {
      id: `clear-mock-status`,
      status: 'COMPLETED',
      filesDeleted: 12,
      chunksDeleted: 143,
      errorMsg: null,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
  },

  async listDriveFolders(_sourceId: string, _parentId = 'root'): Promise<{ folders: DriveFolder[] }> {
    await delay(300);
    return {
      folders: [
        { id: 'folder-001', name: 'Work Documents', path: 'Work Documents', childCount: 3 },
        { id: 'folder-002', name: 'Personal', path: 'Personal', childCount: 0 },
        { id: 'folder-003', name: 'Projects', path: 'Projects', childCount: 5 },
        { id: 'folder-004', name: 'Archive', path: 'Archive', childCount: 0 },
      ],
    };
  },

  async updateConfig(_id: string, _config: { syncFolderIds?: string[] }): Promise<void> {
    await delay(200);
    console.info('[mock] updateConfig called', _config);
  },

  /** In mock mode, just log — no redirect to Google consent screen. */
  async initiateGoogleDrive(): Promise<void> {
    console.info('[mock] Google Drive OAuth initiated — skipped in mock mode');
  },

  async triggerScan(sourceId: string, scanType: 'FULL' | 'INCREMENTAL' = 'FULL'): Promise<{ id: string; status: string }> {
    await delay(400);
    // Simulate SCANNING → IDLE transition after 3s
    _sources = _sources.map((s) => (s.id === sourceId ? { ...s, status: 'SCANNING' as const } : s));
    setTimeout(() => {
      _sources = _sources.map((s) =>
        s.id === sourceId ? { ...s, status: 'IDLE' as const, lastSyncedAt: new Date().toISOString() } : s,
      );
    }, 3000);
    const scanId = `scan-mock-${Date.now()}`;
    // Prepend to scan history
    const history = MOCK_SCAN_HISTORY[sourceId] ?? [];
    MOCK_SCAN_HISTORY[sourceId] = [
      { id: scanId, status: 'RUNNING', startedAt: new Date().toISOString() },
      ...history,
    ];
    console.info(`[mock] Triggered ${scanType} scan on ${sourceId}`);
    return { id: scanId, status: 'RUNNING' };
  },

  async getScanHistory(sourceId: string): Promise<ScanHistoryItem[]> {
    await delay(200);
    return MOCK_SCAN_HISTORY[sourceId] ?? [];
  },
};

export const mockLocalSourcesApi = {
  async registerObsidian(vaultPath: string, displayName?: string): Promise<KmsSource> {
    await delay(350);
    const src: KmsSource = {
      id: `src-${Date.now()}`,
      userId: 'user-001',
      type: 'OBSIDIAN',
      status: 'CONNECTED',
      displayName: displayName ?? vaultPath.split('/').pop() ?? 'Obsidian Vault',
      externalId: null,
      lastSyncedAt: null,
      createdAt: new Date().toISOString(),
    };
    _sources = [..._sources, src];
    return src;
  },

  async registerLocal(path: string, displayName?: string): Promise<KmsSource> {
    await delay(350);
    const src: KmsSource = {
      id: `src-${Date.now()}`,
      userId: 'user-001',
      type: 'LOCAL',
      status: 'CONNECTED',
      displayName: displayName ?? path.split('/').pop() ?? 'Local Folder',
      externalId: null,
      lastSyncedAt: null,
      createdAt: new Date().toISOString(),
    };
    _sources = [..._sources, src];
    return src;
  },
};
