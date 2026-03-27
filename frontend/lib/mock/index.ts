/**
 * Mock Layer — Entry Point
 * ============================================================
 *
 * HOW IT WORKS
 * ------------
 * Set NEXT_PUBLIC_USE_MOCK=true in .env.local to enable mock mode.
 * Every lib/api/*.ts module reads this flag and swaps its exported
 * API object/functions for the corresponding mock handler.
 * Hooks and components are untouched — they never know the difference.
 *
 * SWITCHING TO REAL API
 * ---------------------
 * Remove (or set to false) NEXT_PUBLIC_USE_MOCK in .env.local.
 * No other code changes needed.
 *
 * ADDING NEW MOCK DATA
 * --------------------
 * 1. Add fixtures to the relevant lib/mock/data/*.data.ts file.
 * 2. Update the in-memory state array in the matching handler.
 * 3. Maintain relational integrity:
 *      files.data.ts  ← references sourceId, collectionId, tag ids
 *      search.data.ts ← references fileId from files.data.ts
 *
 * FILE MAP
 * --------
 * data/
 *   users.data.ts       AuthUser, ApiKey fixtures
 *   tags.data.ts        KmsTag fixtures
 *   sources.data.ts     KmsSource + scan history fixtures
 *   collections.data.ts KmsCollection fixtures
 *   files.data.ts       KmsFile fixtures (relational — refs above ids)
 *   search.data.ts      SearchResult chunks (refs file ids)
 *   chat.data.ts        ACP event sequences (keyword-matched by query)
 *
 * handlers/
 *   auth.mock.ts        login, register, getMe, api-keys
 *   files.mock.ts       filesApi, tagsApi
 *   sources.mock.ts     kmsSourcesApi, localSourcesApi
 *   collections.mock.ts collectionsApi
 *   search.mock.ts      searchApi
 *   acp.mock.ts         acpInitialize, acpCreateSession, acpPromptStream, acpCloseSession
 */

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';
