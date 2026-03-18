# KMS Vision

## The One-Line Vision

KMS is your personal AI operating system: everything you know, everything you create, everything you want to do — in one place, accessible through conversation and agentic workflows.

---

## The Three Pillars

### 1. Know — Ingest and Remember Anything

KMS is a universal ingestion layer. Anything you encounter — a YouTube video, a web article, a voice memo, a local file, a Google Drive document, a generated summary — can be dropped into KMS and remembered permanently.

Ingestion is not passive storage. When content enters KMS:
- It is extracted, chunked, and embedded (BGE-M3 at 1024 dimensions)
- It is indexed in Qdrant for semantic retrieval
- It is linked in Neo4j for graph traversal
- The original file lands in your chosen file store (Obsidian vault, local filesystem, Google Drive)
- A database reference is created in PostgreSQL so the content is discoverable forever

Your knowledge base grows continuously. Nothing is lost. Nothing requires manual organization.

### 2. Retrieve — Find Anything, Any Way

KMS retrieves knowledge through tiered retrieval — not every query needs a language model, and most should not use one.

- **BM25 (Tier 0)**: Exact-match keyword search. 50ms. No LLM. Handles "What does ADR-0009 say?" directly.
- **Hybrid Search (Tier 1)**: BM25 + vector similarity reranked by BGE-M3. Handles "What do we know about authentication patterns?"
- **Graph Expansion (Tier 2)**: Neo4j traversal. Finds related documents by entity relationships. Handles "What else is connected to the OAuth decision?"
- **LLM Synthesis (Tier 3)**: Full RAG. Used only when a synthesized answer is genuinely required. Guards prevent unnecessary LLM calls.

Retrieval is accessible via chat, direct API, or Claude Code MCP tool calls.

### 3. Act — Execute Any Knowledge Task

KMS is not a static retrieval system. It can act on knowledge through agent workflows.

Any trigger — a message, a dropped URL, an uploaded file, a scheduled job — can initiate a workflow. Workflows are sequences of agent steps: extract, retrieve, generate, store. The Agent Communication Protocol (ACP) is the backbone all agents speak.

Claude Code, Codex, Gemini, or any ACP-compatible agent can be a step in a workflow. KMS orchestrates them.

---

## Core User Journeys

### Journey 1: Processing a YouTube Video

You are watching a great YouTube video on distributed systems. You drop the URL into KMS chat.

KMS:
1. Detects the URL as a YouTube link
2. Extracts the transcript via the url-agent service
3. Generates a structured summary using Claude
4. Saves the summary as a Markdown note to your Obsidian vault
5. Creates a PostgreSQL record linking the note to its source URL
6. Embeds the content and indexes it in Qdrant

From this point forward, the video's content is part of your knowledge base. You can ask "What did that video about Raft consensus say about leader elections?" and get a direct answer with a citation to the note.

### Journey 2: Writing a Blog Post from Your Own Knowledge

You want to write a blog post about your authentication architecture.

You tell KMS: "Write a blog post about our authentication architecture based on what we've built."

KMS:
1. Runs a hybrid search for "authentication architecture" across your knowledge base
2. Retrieves relevant PRDs (PRD-M02), ADRs (ADR-0003, ADR-0007), and code notes
3. Passes the retrieved context to Claude with a structured blog post prompt
4. Claude generates a well-structured, citation-backed blog post
5. KMS saves the post as a Markdown file to your Obsidian vault or local filesystem
6. Creates a database reference so the generated post is itself searchable

The blog post is grounded in your actual decisions, not Claude's general knowledge.

### Journey 3: Claude Code Coding with Live Context

You are coding a new authentication module. Claude Code has KMS connected as an MCP server.

While you work, Claude Code autonomously calls `kms_search("auth patterns")` to find your team's established patterns. KMS returns:
- Your JWT guard implementation notes
- Your ADR on session management
- Code snippets from previous auth work

Claude Code uses this context to generate code that conforms to your actual codebase conventions — not generic patterns from its training data.

No manual copy-paste. No "here's what I generally do for auth." Your knowledge base informs the code.

### Journey 4: Recalling a Past Decision

Three months ago, you decided which embedding model to use. You cannot remember the details.

You ask KMS: "What was our decision about which embedding model to use?"

KMS:
1. Query Classifier detects this as a factual lookup (low complexity, specific entity)
2. BM25 directly retrieves ADR-0009 ("Embedding Model Selection — BGE-M3")
3. Returns: "You chose BAAI/bge-m3 at 1024 dimensions because it outperforms nomic-embed-text on multilingual recall, runs locally without an API call, and produces stable embeddings for Qdrant. See ADR-0009."

Total latency: ~50ms. No LLM call made. The answer is direct and cited.

### Journey 5: Synthesizing Everything on a Topic

You want a comprehensive view of everything in your knowledge base about a topic.

You ask: "Summarize everything in my knowledge base about authentication."

KMS:
1. Hybrid search finds all documents touching authentication
2. Graph expansion discovers related documents via entity links (OAuth → JWT → session → Redis)
3. The full document set is assembled and passed to Claude
4. Claude synthesizes a structured summary: background, decisions made, patterns established, open questions
5. Each claim is cited to its source document

You receive a research-quality synthesis of your own accumulated knowledge in under 10 seconds.

---

## What KMS Is NOT

- **NOT a general-purpose coding assistant.** That is Claude Code. KMS augments Claude Code by providing your knowledge base as context.
- **NOT a generic AI chatbot.** KMS answers from your knowledge base, not from its training data. When it cites something, the citation exists in your files.
- **NOT a replacement for Obsidian.** KMS augments Obsidian. Your notes remain human-readable Markdown files in your vault. KMS adds retrieval, linking, and agentic workflows on top.
- **NOT dependent on an always-on LLM.** Tier 0 and Tier 1 retrieval work without any LLM. Most queries — exact lookups, keyword searches, semantic searches — resolve without a Claude API call.

---

## The Storage Model

KMS uses a deliberate dual-storage model. Files and databases serve different purposes and neither replaces the other.

### File Layer

Every piece of content has a canonical file:
- **Obsidian vault**: Markdown notes, summaries, generated content, meeting notes
- **Local filesystem**: Any folder you register as a source
- **Google Drive**: Remote files synced via the Google Drive connector

Files are human-readable, portable, and version-controlled. They do not require KMS to be useful. If KMS disappeared tomorrow, your files remain intact.

### Database Layer

The database layer makes files discoverable and relational:
- **PostgreSQL**: Metadata, source references, collection membership, file-to-chunk mapping, creation provenance
- **Qdrant**: Vector embeddings for semantic search across all content
- **Neo4j**: Entity and concept relationships — documents are linked by the ideas they share, not just by folder structure

### Generated Content Flow

Generated content (blog posts, summaries, transcripts, reports) always follows this sequence:
1. Content is generated by Claude
2. Saved to the file layer first (Obsidian vault or local filesystem)
3. A PostgreSQL record is created with the file path, source, and generation metadata
4. The content is embedded and indexed in Qdrant
5. Entities are extracted and linked in Neo4j

The file is the source of truth. The database is the discovery layer.

---

## The Agent Model

Every non-trivial task in KMS is a workflow. Workflows are composable sequences of agent steps.

### Triggers

Anything can trigger a workflow:
- A chat message ("write a blog post about X")
- A dropped URL
- A file uploaded to a watched folder
- A scheduled job ("every Monday, summarize new documents from last week")
- An external agent calling the ACP endpoint

### Workflow Execution

A workflow is a directed graph of steps, executed by the WorkflowEngine in kms-api:

```
trigger → [extract] → [retrieve] → [generate] → [store] → [notify]
```

Each step is an agent or a tool call. Steps can run sequentially or in parallel. The state is persisted via LangGraph checkpointing so workflows survive restarts.

### The ACP Protocol

All agents in KMS speak Agent Communication Protocol (ACP). ACP defines:
- How to initialize a session
- How to send a prompt and receive a streamed response
- How to call tools (kms_search, kms_store, kms_spawn_agent)

Because ACP is the backbone, any ACP-compatible external agent can participate in KMS workflows:
- Claude Code connects as an MCP client and calls kms_search during coding
- A Codex agent can be invoked as a workflow step for code generation
- A Gemini agent can be invoked for document analysis

KMS does not lock you into one LLM. The LLM provider is an abstraction. Claude is the default. Ollama supports local-only operation. The provider can be swapped per workflow step.

### Tool Registry

The tools available to agents in KMS:

| Tool | Description |
|------|-------------|
| `kms_search` | Hybrid semantic + BM25 search across the knowledge base |
| `kms_store` | Save content to file layer + index in database layer |
| `kms_graph_query` | Neo4j entity traversal |
| `kms_spawn_agent` | Invoke a sub-agent (Claude, Codex, Gemini) as a workflow step |
| `kms_ingest_url` | Extract and ingest a URL (web page or YouTube) |
| `kms_list_sources` | List registered knowledge sources |

---

## Why This Matters

Personal AI assistants are only as good as the context they have. Generic assistants have no context about you. RAG chatbots retrieve but do not act. Note-taking apps organize but do not synthesize.

KMS closes the loop: ingest everything, retrieve anything, act on knowledge through workflows. The result is an AI system that knows what you know, respects how you already work (your Obsidian vault, your file system), and can execute multi-step tasks on your behalf.

This is not a product. It is infrastructure for augmented knowledge work.
