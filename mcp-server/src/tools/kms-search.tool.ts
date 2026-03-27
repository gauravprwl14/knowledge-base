import { z } from 'zod';
import { McpServerConfig } from '../config';

/** Input schema for the kms_search MCP tool. */
export const KmsSearchInputSchema = z.object({
  query: z.string().min(1).describe('The search query string'),
  type: z
    .enum(['keyword', 'semantic', 'hybrid'])
    .optional()
    .default('hybrid')
    .describe('Search strategy — defaults to hybrid (BM25 + semantic + RRF)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(10)
    .describe('Maximum number of results to return (1–20)'),
});

export type KmsSearchInput = z.infer<typeof KmsSearchInputSchema>;

/** A single search result returned by kms_search. */
export interface KmsSearchResult {
  fileId: string;
  filename: string;
  snippet: string;
  score: number;
  chunkIndex: number;
  sourceId: string;
}

/** Full response from kms_search. */
export interface KmsSearchOutput {
  results: KmsSearchResult[];
  total: number;
  took_ms: number;
  mode: string;
}

/**
 * Executes the kms_search MCP tool.
 *
 * Calls POST /api/v1/search on kms-api (which in turn proxies to search-api).
 * The JWT token in the config is forwarded as the Authorization header so
 * the result set is scoped to the authenticated user's knowledge base.
 *
 * @param input  - Validated tool input (query, type, limit)
 * @param config - MCP server configuration
 * @returns KmsSearchOutput with ranked result snippets
 * @throws Error when kms-api is unreachable or returns a non-2xx response
 */
export async function kmsSearch(
  input: KmsSearchInput,
  config: McpServerConfig,
): Promise<KmsSearchOutput> {
  const params = new URLSearchParams({
    q: input.query,
    type: input.type ?? 'hybrid',
    limit: String(input.limit ?? 10),
  });

  const url = `${config.kmsApiUrl}/api/v1/search?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.kmsApiToken}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`kms_search: kms-api returned HTTP ${response.status}`);
  }

  return response.json() as Promise<KmsSearchOutput>;
}

/** MCP tool descriptor for kms_search. */
export const KmsSearchToolDefinition = {
  name: 'kms_search',
  description:
    'Search the KMS knowledge base for relevant content. ' +
    'Returns ranked snippets from documents you have previously ingested. ' +
    'Use this before answering knowledge-intensive questions to ground your response in private context.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'The search query string',
      },
      type: {
        type: 'string',
        enum: ['keyword', 'semantic', 'hybrid'],
        description: 'Search strategy — defaults to hybrid',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (1–20, default 10)',
      },
    },
    required: ['query'],
  },
};
