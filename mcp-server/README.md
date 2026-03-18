# KMS MCP Server

Exposes three MCP tools to Claude Code:

| Tool | Description |
|------|-------------|
| `kms_search` | Hybrid semantic+keyword search over your knowledge base |
| `kms_store` | Store a snippet or note — chunked and embedded asynchronously |
| `kms_graph_query` | Traverse the Neo4j knowledge graph for related documents |

## Setup

```bash
cd mcp-server
npm install
npm run build
```

## Claude Code Integration

Add to `~/.claude/settings.json` (global) or `.claude/settings.local.json` (project):

```json
{
  "mcpServers": {
    "kms": {
      "command": "node",
      "args": ["<absolute-path>/mcp-server/dist/index.js"],
      "env": {
        "KMS_API_URL": "http://localhost:8000",
        "KMS_API_TOKEN": "<your-jwt-access-token>"
      }
    }
  }
}
```

Restart Claude Code after saving. The tools will appear as `/kms:kms_search`, `/kms:kms_store`, and `/kms:kms_graph_query`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KMS_API_URL` | `http://localhost:8000` | kms-api base URL |
| `SEARCH_API_URL` | `http://localhost:8001` | search-api base URL |
| `KMS_API_TOKEN` | *(required)* | JWT access token |
| `MCP_DEBUG` | `false` | Set to `true` for verbose stderr logging |

## Getting a JWT Token

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"yourpassword"}' \
  | jq -r '.tokens.accessToken'
```

Paste the result as `KMS_API_TOKEN` in your MCP server config.
