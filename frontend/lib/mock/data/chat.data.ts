/**
 * Mock data — ACP Chat Response Sequences
 *
 * Each sequence is a series of AcpEvents that the mock stream emits.
 * The mock handler picks the best-matching sequence based on the user's query.
 *
 * Adding a new response:
 *   1. Add a new entry to MOCK_CHAT_SEQUENCES.
 *   2. Add its keywords to SEQUENCE_KEYWORDS.
 *   3. It will be auto-selected when a matching query arrives.
 */

import type { AcpEvent } from '@/lib/api/acp';

export interface MockEventFrame {
  event: AcpEvent;
  /** Milliseconds to wait before emitting this event. */
  delayMs: number;
}

// ─── Response sequence builders ─────────────────────────────────────────────

function chunk(text: string, delayMs = 40): MockEventFrame {
  return { event: { type: 'agent_message_chunk', data: { text } }, delayMs };
}

function toolStart(tool: string, args: Record<string, unknown> = {}, delayMs = 300): MockEventFrame {
  return { event: { type: 'tool_call_start', data: { tool, args } }, delayMs };
}

function toolResult(tool: string, resultCount: number, delayMs = 500): MockEventFrame {
  return { event: { type: 'tool_call_result', data: { tool, resultCount } }, delayMs };
}

const done: MockEventFrame = { event: { type: 'done', data: {} }, delayMs: 50 };

// ─── Sequences ───────────────────────────────────────────────────────────────

const searchSequence: MockEventFrame[] = [
  toolStart('kms_search', { query: '<user query>', limit: 5 }),
  toolResult('kms_search', 5),
  chunk("Based on your knowledge base, I found **5 relevant chunks** across 3 files.\n\n"),
  chunk("The most relevant source is **transformer-attention-is-all-you-need.pdf**, which describes how the attention mechanism allows the model to focus on different parts of the input sequence.\n\n"),
  chunk("Your notes in **rag-architecture-notes.md** also provide a practical perspective: hybrid search combining BM25 and dense vector retrieval with Reciprocal Rank Fusion (RRF) gives the best relevance across diverse query types.\n\n"),
  chunk("Would you like me to summarise any of these documents in more detail?"),
  done,
];

const ragSequence: MockEventFrame[] = [
  toolStart('kms_search', { query: 'RAG retrieval augmented generation' }),
  toolResult('kms_search', 4),
  chunk("**Retrieval-Augmented Generation (RAG)** works in two stages:\n\n"),
  chunk("1. **Retrieval** — given a user query, a retriever (BM25, dense ANN, or hybrid) fetches the top-K relevant chunks from your knowledge base.\n"),
  chunk("2. **Generation** — these chunks are prepended to the prompt as context, and an LLM generates a grounded answer.\n\n"),
  chunk("Your **rag-architecture-notes.md** highlights that this KMS uses a hybrid pipeline: Qdrant (BAAI/bge-m3 embeddings) for semantic search + PostgreSQL FTS for keyword search, fused with RRF.\n\n"),
  chunk("This approach outperforms either method alone, especially for technical queries where exact terms matter alongside semantic similarity."),
  done,
];

const meetingSequence: MockEventFrame[] = [
  toolStart('kms_search', { query: 'meeting notes action items' }),
  toolResult('kms_search', 3),
  chunk("From your meeting notes and project docs, here are the key **action items**:\n\n"),
  chunk("📋 **Q1 Planning (q1-planning-meeting-notes.md)**\n"),
  chunk("- Finalise KMS embedding pipeline by March 31\n"),
  chunk("- Schedule demo with stakeholders\n"),
  chunk("- Review search relevance metrics — target P@5 > 0.8\n\n"),
  chunk("📋 **Product Roadmap (product-roadmap-2025.docx)**\n"),
  chunk("- Phase 2 (Q2): Hybrid search + RAG chat ← *in progress*\n"),
  chunk("- Phase 3 (Q3): Agent framework, multi-source federation\n\n"),
  chunk("Everything on track based on the sprint retrospective! 🎯"),
  done,
];

const summarySequence: MockEventFrame[] = [
  toolStart('kms_search', { query: '<user query>' }),
  toolResult('kms_search', 6),
  toolStart('kms_search', { query: 'related context' }),
  toolResult('kms_search', 3),
  chunk("Here's a **summary of your knowledge base** across all connected sources:\n\n"),
  chunk("### Google Drive (src-001)\n"),
  chunk("- 4 files indexed — mainly AI research papers and finance docs\n"),
  chunk("- Most recent: *transformer-attention* and *LLM survey* papers\n\n"),
  chunk("### Local Documents (src-002)\n"),
  chunk("- 3 files indexed — work project docs (roadmap, meeting notes, sprint retro)\n\n"),
  chunk("### Obsidian Vault (src-003)\n"),
  chunk("- 3 files indexed — personal journal, RAG notes, ideas backlog\n\n"),
  chunk("**Total: 10 files, ~6.4 MB indexed.** The most active theme across your notes is **AI/ML research**, particularly around RAG architectures and transformer models."),
  done,
];

const fallbackSequence: MockEventFrame[] = [
  chunk("I searched your knowledge base for relevant context.\n\n"),
  chunk("Based on your indexed documents, I can see you're working on a **Knowledge Management System** that combines hybrid search (BM25 + semantic), RAG-powered chat, and multi-source connectors (Google Drive, local filesystem, Obsidian).\n\n"),
  chunk("Could you be more specific about what you're looking for? I can help you:\n"),
  chunk("- **Search** across your documents\n"),
  chunk("- **Summarise** specific files or topics\n"),
  chunk("- **Find action items** in your meeting notes\n"),
  chunk("- **Explain** concepts from your research papers"),
  done,
];

// ─── Sequence registry ───────────────────────────────────────────────────────

export const MOCK_CHAT_SEQUENCES: Record<string, MockEventFrame[]> = {
  search: searchSequence,
  rag: ragSequence,
  meeting: meetingSequence,
  summary: summarySequence,
  fallback: fallbackSequence,
};

/** Maps sequence keys to keyword triggers (checked via `includes`). */
const SEQUENCE_KEYWORDS: Record<string, string[]> = {
  rag: ['rag', 'retrieval', 'augmented', 'generation', 'vector', 'embedding'],
  meeting: ['meeting', 'action item', 'task', 'todo', 'sprint', 'roadmap', 'planning'],
  summary: ['summary', 'summarise', 'summarize', 'overview', 'what do i have', 'all files'],
  search: ['search', 'find', 'look up', 'where', 'what is', 'tell me about', 'explain'],
};

/**
 * Pick the best-matching response sequence for a given query.
 * Injects the actual query text into the toolStart args.
 */
export function pickSequence(query: string): MockEventFrame[] {
  const q = query.toLowerCase();

  for (const [key, keywords] of Object.entries(SEQUENCE_KEYWORDS)) {
    if (keywords.some((kw) => q.includes(kw))) {
      const seq = MOCK_CHAT_SEQUENCES[key];
      // Inject real query into any toolStart frames
      return seq.map((frame) => {
        if (frame.event.type === 'tool_call_start' && frame.event.data.args?.query === '<user query>') {
          return {
            ...frame,
            event: {
              ...frame.event,
              data: { ...frame.event.data, args: { ...frame.event.data.args, query } },
            },
          };
        }
        return frame;
      });
    }
  }

  return MOCK_CHAT_SEQUENCES.fallback;
}
