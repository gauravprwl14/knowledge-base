#!/usr/bin/env node
/**
 * KMS MCP Server — entry point.
 *
 * Exposes three tools to Claude Code via the Model Context Protocol (MCP):
 *   - kms_search       — hybrid semantic+keyword search over the knowledge base
 *   - kms_store        — store a snippet/note in the knowledge base
 *   - kms_graph_query  — traverse Neo4j graph for related documents
 *
 * Transport: stdio (the MCP default for Claude Code integration).
 * The server reads JSON-RPC 2.0 requests from stdin and writes responses to stdout.
 *
 * ## Claude Code integration
 *
 * Add to `.claude/settings.json` or `~/.claude/settings.json`:
 * ```json
 * {
 *   "mcpServers": {
 *     "kms": {
 *       "command": "node",
 *       "args": ["/path/to/mcp-server/dist/index.js"],
 *       "env": {
 *         "KMS_API_URL": "http://localhost:8000",
 *         "KMS_API_TOKEN": "<your-jwt-access-token>"
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * ## Environment variables
 * - `KMS_API_URL`    — kms-api base URL (default: http://localhost:8000)
 * - `SEARCH_API_URL` — search-api base URL (default: http://localhost:8001)
 * - `KMS_API_TOKEN`  — JWT access token for kms-api requests
 * - `MCP_DEBUG`      — set to "true" to enable debug logging to stderr
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

import { getConfig } from './config';
import {
  KmsSearchInputSchema,
  KmsSearchToolDefinition,
  kmsSearch,
} from './tools/kms-search.tool';
import {
  KmsStoreInputSchema,
  KmsStoreToolDefinition,
  kmsStore,
} from './tools/kms-store.tool';
import {
  KmsGraphQueryInputSchema,
  KmsGraphQueryToolDefinition,
  kmsGraphQuery,
} from './tools/kms-graph-query.tool';

const config = getConfig();

const server = new Server(
  { name: 'kms', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// ---------------------------------------------------------------------------
// Tool list handler
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [KmsSearchToolDefinition, KmsStoreToolDefinition, KmsGraphQueryToolDefinition],
}));

// ---------------------------------------------------------------------------
// Tool call handler
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (config.debug) {
    process.stderr.write(`[kms-mcp] tool call: ${name} args=${JSON.stringify(args)}\n`);
  }

  try {
    switch (name) {
      case 'kms_search': {
        const input = KmsSearchInputSchema.parse(args);
        const result = await kmsSearch(input, config);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'kms_store': {
        const input = KmsStoreInputSchema.parse(args);
        const result = await kmsStore(input, config);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'kms_graph_query': {
        const input = KmsGraphQueryInputSchema.parse(args);
        const result = await kmsGraphQuery(input, config);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof McpError) throw err;

    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[kms-mcp] tool error: ${name} — ${message}\n`);
    throw new McpError(ErrorCode.InternalError, message);
  }
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[kms-mcp] KMS MCP server started (stdio transport)\n');
}

main().catch((err) => {
  process.stderr.write(`[kms-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
