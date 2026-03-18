import { z } from 'zod';
import { McpServerConfig } from '../config';

/** Input schema for the kms_graph_query MCP tool. */
export const KmsGraphQueryInputSchema = z.object({
  fileId: z
    .string()
    .uuid()
    .optional()
    .describe('Starting file UUID — finds documents related to this file via MENTIONS edges'),
  entity: z
    .string()
    .optional()
    .describe('Entity name to look up in the graph (e.g. "RAG", "LangGraph", "BAAI/bge-m3")'),
  depth: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .default(2)
    .describe('Graph traversal depth — how many hops to follow from the starting node (1–3)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Maximum number of related nodes to return'),
}).refine(
  (data) => data.fileId !== undefined || data.entity !== undefined,
  { message: 'At least one of fileId or entity must be provided' },
);

export type KmsGraphQueryInput = z.infer<typeof KmsGraphQueryInputSchema>;

/** A single node returned by the graph query. */
export interface GraphNode {
  fileId: string;
  filename: string;
  relationship: string;
  distance: number;
  snippet?: string;
}

/** Full response from kms_graph_query. */
export interface KmsGraphQueryOutput {
  nodes: GraphNode[];
  totalRelationships: number;
  queryType: 'file' | 'entity';
  took_ms: number;
}

/**
 * Executes the kms_graph_query MCP tool.
 *
 * Calls GET /api/v1/graph/related on kms-api, which queries Neo4j for
 * MENTIONS and RELATED_TO edges originating from the starting node.
 *
 * Use this to discover semantically related documents beyond pure vector
 * similarity — the graph captures explicit entity relationships extracted
 * by the graph-worker during ingestion.
 *
 * @param input  - Validated tool input (fileId or entity, depth, limit)
 * @param config - MCP server configuration
 * @returns KmsGraphQueryOutput with related document nodes
 * @throws Error when kms-api is unreachable or returns a non-2xx response
 */
export async function kmsGraphQuery(
  input: KmsGraphQueryInput,
  config: McpServerConfig,
): Promise<KmsGraphQueryOutput> {
  const params = new URLSearchParams({ depth: String(input.depth ?? 2), limit: String(input.limit ?? 10) });
  if (input.fileId) params.set('fileId', input.fileId);
  if (input.entity) params.set('entity', input.entity);

  const url = `${config.kmsApiUrl}/api/v1/graph/related?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.kmsApiToken}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`kms_graph_query: kms-api returned HTTP ${response.status}`);
  }

  return response.json() as Promise<KmsGraphQueryOutput>;
}

/** MCP tool descriptor for kms_graph_query. */
export const KmsGraphQueryToolDefinition = {
  name: 'kms_graph_query',
  description:
    'Query the KMS knowledge graph (Neo4j) for documents related to a given file or named entity. ' +
    'Returns nodes connected via MENTIONS or RELATED_TO edges extracted during ingestion. ' +
    'Use this to discover thematically related documents that might not surface in pure vector search.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      fileId: {
        type: 'string',
        description: 'File UUID to find related documents for',
      },
      entity: {
        type: 'string',
        description: 'Entity name to look up in the graph',
      },
      depth: {
        type: 'number',
        description: 'Graph traversal depth (1–3, default 2)',
      },
      limit: {
        type: 'number',
        description: 'Maximum related nodes to return (1–50, default 10)',
      },
    },
  },
};
