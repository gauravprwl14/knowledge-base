# Obsidian Plugin Architecture

**Version**: 1.0
**Date**: 2026-03-17
**ADR**: ADR-010

---

## Overview

The Obsidian plugin provides **bidirectional sync** between an Obsidian vault and the Knowledge Base system. It is implemented as a native Obsidian plugin (TypeScript) and connects to kms-api via REST API.

**Key principle**: The vault is the user's source of truth. The KMS enriches it with connections, duplicates, and related files from other sources.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Obsidian Vault                          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │                 KMS Plugin                          │  │
│  │  (TypeScript, Obsidian Plugin API)                 │  │
│  │                                                    │  │
│  │  • VaultWatcher: detect note create/modify/delete  │  │
│  │  • BacklinkResolver: parse [[wikilinks]]           │  │
│  │  • FrontmatterParser: extract tags, metadata       │  │
│  │  • SidebarPanel: show related files from KMS      │  │
│  │  • SearchPanel: search all sources from vault     │  │
│  │  • SyncManager: queue changes, retry on failure   │  │
│  │                                                    │  │
│  │  Settings:                                         │  │
│  │  • KMS API URL: http://localhost:8000              │  │
│  │  • API Key: kms_xxx...                            │  │
│  │  • Sync interval: 60s                             │  │
│  │  • Include paths: ["Notes/", "Projects/"]         │  │
│  │  • Exclude paths: [".obsidian/", "Templates/"]    │  │
│  └───────────────────┬────────────────────────────────┘  │
└─────────────────────┼────────────────────────────────────┘
                      │ REST API (kms-api)
                      ▼
┌──────────────────────────────────────────────────────────┐
│                  kms-api (NestJS)                         │
│  • POST /api/v1/notes/sync     (push note changes)       │
│  • GET  /api/v1/notes/related  (pull related content)    │
│  • POST /api/v1/search         (search all sources)      │
│  • GET  /api/v1/graph/backlinks (resolve [[links]])      │
└──────────────────────────────────────────────────────────┘
```

---

## Plugin Directory Structure

```
obsidian-kms-plugin/
├── src/
│   ├── main.ts                    # Plugin entry point
│   ├── settings/
│   │   ├── settings.ts            # Plugin settings schema
│   │   └── settings-tab.ts        # Settings UI
│   ├── sync/
│   │   ├── vault-watcher.ts       # File system events
│   │   ├── sync-manager.ts        # Queue + retry logic
│   │   └── sync-queue.ts          # In-memory queue
│   ├── parsers/
│   │   ├── markdown-parser.ts     # Parse MD + frontmatter
│   │   ├── backlink-resolver.ts   # [[wikilink]] parsing
│   │   └── frontmatter-parser.ts  # YAML frontmatter
│   ├── ui/
│   │   ├── sidebar-view.ts        # Related files panel
│   │   ├── search-modal.ts        # Global search modal
│   │   └── status-bar.ts          # Sync status indicator
│   ├── api/
│   │   ├── kms-client.ts          # HTTP client for kms-api
│   │   └── types.ts               # API response types
│   └── utils/
│       └── debounce.ts
├── styles.css
├── manifest.json
├── package.json
├── tsconfig.json
└── tests/
    ├── unit/
    │   ├── markdown-parser.spec.ts
    │   ├── backlink-resolver.spec.ts
    │   └── sync-manager.spec.ts
    └── integration/
        └── kms-client.spec.ts
```

---

## Core Sync Protocol

### Push (Vault → KMS)

```typescript
// On note create/modify
interface NoteSyncPayload {
  vault_path: string;           // "Notes/Machine Learning.md"
  content: string;              // Raw markdown content
  frontmatter: Record<string, unknown>; // YAML metadata
  backlinks: string[];          // ["[[Neural Networks]]", "[[AI Basics]]"]
  tags: string[];               // ["#ml", "#ai"]
  last_modified: string;        // ISO timestamp
  checksum: string;             // SHA-256 of content (for dedup)
}
```

### Pull (KMS → Vault)

```typescript
// Related content returned by KMS
interface RelatedContent {
  files: RelatedFile[];         // Files from other sources (Google Drive, etc.)
  notes: RelatedNote[];         // Similar notes in the vault
  concepts: ConceptLink[];      // Graph concepts connected to this note
  duplicates?: DuplicateAlert[]; // If similar content exists elsewhere
}
```

---

## Plug-and-Play Connector Architecture

The plugin uses a **connector registration pattern**. New data sources can be added without modifying the plugin core.

```typescript
// base-connector.ts
interface ObsidianConnector {
  id: string;
  displayName: string;
  icon: string;

  // Lifecycle
  onLoad(settings: PluginSettings): Promise<void>;
  onUnload(): Promise<void>;

  // Capabilities
  canSync(): boolean;
  canSearch(): boolean;

  // Operations
  sync?(vault: Vault): Promise<SyncResult>;
  search?(query: string): Promise<SearchResult[]>;
}

// Registered connectors
const connectors: ObsidianConnector[] = [
  new KMSConnector(),            // Core — always present
  new GoogleDriveConnector(),    // Pull files from Drive into sidebar
  new GitHubConnector(),         // Link to GitHub issues/PRs
  // Future: NotionConnector, LinearConnector, etc.
];
```

---

## Test Strategy (TDD)

```typescript
// tests/unit/backlink-resolver.spec.ts
describe('BacklinkResolver', () => {
  it('extracts wikilinks from markdown', () => {
    const content = 'See [[Machine Learning]] and [[Neural Networks|NN]].';
    const resolver = new BacklinkResolver();
    const links = resolver.extract(content);
    expect(links).toEqual([
      { target: 'Machine Learning', alias: null },
      { target: 'Neural Networks', alias: 'NN' },
    ]);
  });

  it('resolves wikilinks to existing vault files', async () => {
    const mockVault = createMockVault(['Machine Learning.md', 'AI Basics.md']);
    const resolver = new BacklinkResolver(mockVault);
    const resolved = await resolver.resolve(['Machine Learning', 'Nonexistent']);
    expect(resolved.found).toHaveLength(1);
    expect(resolved.broken).toContain('Nonexistent');
  });
});
```

---

## Manifest

```json
{
  "id": "kms-plugin",
  "name": "Knowledge Base Sync",
  "version": "1.0.0",
  "minAppVersion": "1.4.0",
  "description": "Sync your vault with the Knowledge Base system. Search across all sources. Discover related files.",
  "author": "Knowledge Base Team",
  "authorUrl": "https://github.com/your-org/knowledge-base",
  "isDesktopOnly": false
}
```
