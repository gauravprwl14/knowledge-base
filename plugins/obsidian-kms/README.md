# obsidian-kms

An Obsidian plugin that integrates your vault with the KMS (Knowledge Management System) API.

Two commands are added to Obsidian's command palette:

| Command | What it does |
|---------|--------------|
| **Send current note to KMS** | POSTs the active note to the KMS ingest endpoint so it is indexed and searchable |
| **Ask KMS** | Opens a modal, accepts a natural-language query, streams the answer back via SSE, and saves the response as a new note |

---

## Build from source

```bash
cd plugins/obsidian-kms
npm install
npm run build        # produces main.js
```

For hot-reload during development:

```bash
npm run dev          # watches for changes and rebuilds automatically
```

---

## Installation

1. Build the plugin (see above) to produce `main.js`.
2. Copy the three required files into your vault's plugin directory:

```bash
VAULT=~/path/to/your/vault

mkdir -p "$VAULT/.obsidian/plugins/obsidian-kms"
cp main.js manifest.json "$VAULT/.obsidian/plugins/obsidian-kms/"
```

3. In Obsidian, open **Settings > Community plugins**, disable Safe Mode if prompted, then enable **KMS Integration**.

---

## Configuration

Open **Settings > KMS Integration** and fill in the three fields:

| Field | Description | Default |
|-------|-------------|---------|
| **KMS API URL** | Base URL of your KMS API server — no trailing slash | `http://localhost:3000` |
| **JWT Token** | Your KMS API access token (stored locally, never sent anywhere except the configured API URL) | _(empty)_ |
| **Response folder** | Vault folder where "Ask KMS" responses are saved | `KMS Responses` |

Both **KMS API URL** and **JWT Token** must be set before either command will work.

---

## Usage

### Send current note to KMS

1. Open any markdown note in Obsidian.
2. Open the command palette (`Cmd/Ctrl+P`) and run **Send current note to KMS**.
3. A notice appears confirming the note was queued for indexing, showing the first 8 characters of the assigned file ID.

The note's title, full markdown content, and vault path are sent to `POST {apiUrl}/files/ingest`.

### Ask KMS

1. Open the command palette and run **Ask KMS**.
2. Type your question into the input field and press **Enter** (or click **Ask**).
3. The response streams in live inside the modal.
4. Once the stream finishes, the full response is saved as a new note inside the configured response folder and opened automatically.

Response notes are named:

```
KMS - {first 40 chars of query} - {YYYY-MM DD-HH-MM}.md
```

---

## Troubleshooting

- **"Please configure the API URL and JWT token"** — open plugin settings and fill in both fields.
- **HTTP 401** — your JWT token is expired or incorrect; generate a new one from the KMS API.
- **HTTP 404 on /files/ingest** — confirm the KMS API is running and the API URL is correct.
- **Stream hangs** — check that the KMS RAG service is healthy (`docker compose logs rag-service`).
