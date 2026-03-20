/**
 * Mock handler — Sources API
 *
 * Matches the exact shapes of `kmsSourcesApi` and `localSourcesApi`
 * in lib/api/sources.ts, plus the scan/scan-history methods.
 *
 * Swap: set NEXT_PUBLIC_USE_MOCK=true in .env.local.
 */

import { MOCK_SOURCES, MOCK_SCAN_HISTORY } from '../data/sources.data';
import type { KmsSource } from '@/lib/api/sources';
import type { ScanHistoryItem } from '@/lib/api/sources';

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

  async disconnect(id: string): Promise<void> {
    await delay(300);
    _sources = _sources.map((s) =>
      s.id === id ? { ...s, status: 'DISCONNECTED' as const } : s,
    );
  },

  /** In mock mode, just log — no redirect to Google consent screen. */
  initiateGoogleDrive(_userId: string): void {
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
