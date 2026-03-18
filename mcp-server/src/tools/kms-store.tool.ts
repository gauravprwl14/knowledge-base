import { z } from 'zod';
import { McpServerConfig } from '../config';

/** Input schema for the kms_store MCP tool. */
export const KmsStoreInputSchema = z.object({
  content: z.string().min(1).describe('Markdown or plain text content to store in the knowledge base'),
  title: z.string().min(1).describe('Human-readable title for the stored document'),
  tags: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Optional list of tag names to associate with the stored document'),
  collectionId: z
    .string()
    .uuid()
    .optional()
    .describe('Optional collection UUID to add the document to after ingestion'),
  sourceType: z
    .enum(['snippet', 'note', 'url', 'conversation'])
    .optional()
    .default('snippet')
    .describe('Classifies the origin of the content for search and display'),
});

export type KmsStoreInput = z.infer<typeof KmsStoreInputSchema>;

/** Response returned by kms_store. */
export interface KmsStoreOutput {
  fileId: string;
  filename: string;
  status: 'created' | 'queued_for_embedding';
  embeddingJobId?: string;
  message: string;
}

/**
 * Executes the kms_store MCP tool.
 *
 * POSTs the content as a text snippet to kms-api. The file is created in the
 * database and an embedding job is queued for async vector indexing.
 * Once indexed, the content is searchable via kms_search.
 *
 * @param input  - Validated tool input (content, title, tags, etc.)
 * @param config - MCP server configuration
 * @returns KmsStoreOutput with the created file ID and embedding job status
 * @throws Error when kms-api is unreachable or returns a non-2xx response
 */
export async function kmsStore(
  input: KmsStoreInput,
  config: McpServerConfig,
): Promise<KmsStoreOutput> {
  const url = `${config.kmsApiUrl}/api/v1/files/snippet`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.kmsApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: input.content,
      title: input.title,
      tags: input.tags ?? [],
      collectionId: input.collectionId,
      sourceType: input.sourceType ?? 'snippet',
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`kms_store: kms-api returned HTTP ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<KmsStoreOutput>;
}

/** MCP tool descriptor for kms_store. */
export const KmsStoreToolDefinition = {
  name: 'kms_store',
  description:
    'Store a snippet, note, or piece of content in the KMS knowledge base. ' +
    'The content is chunked and embedded asynchronously so it will be searchable via kms_search ' +
    'within a few seconds. Use this to capture important information for future retrieval.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      content: {
        type: 'string',
        description: 'Markdown or plain text content to store',
      },
      title: {
        type: 'string',
        description: 'Human-readable title for the document',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tag names to apply',
      },
      collectionId: {
        type: 'string',
        description: 'Optional collection UUID to add the document to',
      },
      sourceType: {
        type: 'string',
        enum: ['snippet', 'note', 'url', 'conversation'],
        description: 'Content origin type (default: snippet)',
      },
    },
    required: ['content', 'title'],
  },
};
