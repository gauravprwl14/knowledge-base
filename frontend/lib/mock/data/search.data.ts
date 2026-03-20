/**
 * Mock data — Search Results
 *
 * Chunk-level search results that reference real file IDs from files.data.ts.
 * Used by mockSearchApi to filter/rank results based on query keywords.
 */

import type { SearchResult } from '@/lib/api/search';

/** Full corpus of mock chunks. The search handler filters this by query. */
export const MOCK_CHUNKS: SearchResult[] = [
  {
    id: 'chunk-001',
    fileId: 'file-001',
    filename: 'transformer-attention-is-all-you-need.pdf',
    content:
      'The attention mechanism allows the model to focus on different parts of the input sequence when producing an output. Self-attention, also called intra-attention, relates different positions of a single sequence in order to compute a representation of the sequence.',
    score: 0.97,
    chunkIndex: 0,
    metadata: { page: 2, heading: 'Model Architecture' },
  },
  {
    id: 'chunk-002',
    fileId: 'file-001',
    filename: 'transformer-attention-is-all-you-need.pdf',
    content:
      'Multi-Head Attention allows the model to jointly attend to information from different representation subspaces at different positions. With a single attention head, averaging inhibits this.',
    score: 0.94,
    chunkIndex: 1,
    metadata: { page: 4, heading: 'Attention Is All You Need' },
  },
  {
    id: 'chunk-003',
    fileId: 'file-002',
    filename: 'llm-fundamentals-survey-2024.pdf',
    content:
      'Large Language Models (LLMs) are trained on vast text corpora using unsupervised objectives such as next-token prediction. Scaling laws demonstrate that model capability improves predictably with more compute, data, and parameters.',
    score: 0.91,
    chunkIndex: 0,
    metadata: { page: 1, heading: 'Introduction' },
  },
  {
    id: 'chunk-004',
    fileId: 'file-002',
    filename: 'llm-fundamentals-survey-2024.pdf',
    content:
      'Instruction tuning and RLHF (Reinforcement Learning from Human Feedback) significantly improve LLM alignment with human intent, enabling models to follow complex instructions and reduce harmful outputs.',
    score: 0.88,
    chunkIndex: 3,
    metadata: { page: 8, heading: 'Fine-Tuning Paradigms' },
  },
  {
    id: 'chunk-005',
    fileId: 'file-006',
    filename: 'rag-architecture-notes.md',
    content:
      'Retrieval-Augmented Generation (RAG) combines a retrieval step with generation. The retrieval stage uses dense or sparse embeddings to find relevant context, which is then prepended to the prompt before sending to the LLM.',
    score: 0.95,
    chunkIndex: 0,
    metadata: { heading: 'RAG Overview' },
  },
  {
    id: 'chunk-006',
    fileId: 'file-006',
    filename: 'rag-architecture-notes.md',
    content:
      'Hybrid search combines BM25 keyword retrieval with semantic ANN (approximate nearest neighbour) search. Reciprocal Rank Fusion (RRF) merges the two ranked lists into a single relevance-ordered result set.',
    score: 0.92,
    chunkIndex: 2,
    metadata: { heading: 'Hybrid Retrieval' },
  },
  {
    id: 'chunk-007',
    fileId: 'file-003',
    filename: 'q1-planning-meeting-notes.md',
    content:
      'Action items from Q1 planning: (1) Finalise KMS embedding pipeline by March 31. (2) Schedule demo with stakeholders. (3) Review search relevance metrics — target P@5 > 0.8.',
    score: 0.72,
    chunkIndex: 0,
    metadata: { heading: 'Action Items' },
  },
  {
    id: 'chunk-008',
    fileId: 'file-004',
    filename: 'product-roadmap-2025.docx',
    content:
      'Phase 1 (Q1): Core knowledge ingestion pipeline. Phase 2 (Q2): Hybrid search + RAG chat. Phase 3 (Q3): Agent framework, multi-source federation. Phase 4 (Q4): Enterprise SSO and audit logging.',
    score: 0.68,
    chunkIndex: 0,
    metadata: { heading: 'Roadmap Overview' },
  },
  {
    id: 'chunk-009',
    fileId: 'file-005',
    filename: 'personal-journal-march-2025.md',
    content:
      'Started integrating the KMS into my daily workflow. Using the Obsidian connector to sync my personal vault — really useful for surfacing old notes I\'d forgotten about.',
    score: 0.63,
    chunkIndex: 1,
    metadata: { heading: 'March 15' },
  },
  {
    id: 'chunk-010',
    fileId: 'file-007',
    filename: 'sprint-17-retrospective.pdf',
    content:
      'What went well: search relevance exceeded targets. Shipped hybrid BM25 + vector search with RRF. What to improve: embed-worker throughput was a bottleneck during bulk ingestion.',
    score: 0.71,
    chunkIndex: 0,
    metadata: { page: 1, heading: 'Sprint Retrospective' },
  },
];

/**
 * Returns a ranked, filtered slice of MOCK_CHUNKS based on query text.
 * Scores chunks by how many query words appear in their content (case-insensitive).
 * Falls back to the top-N chunks by static score if nothing matches.
 */
export function filterChunks(
  query: string,
  limit = 20,
): SearchResult[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  const scored = MOCK_CHUNKS.map((chunk) => {
    const text = (chunk.content + ' ' + chunk.filename).toLowerCase();
    const hits = words.filter((w) => text.includes(w)).length;
    // Boost score by keyword hits, keep original score as tiebreaker
    const adjusted = hits > 0 ? Math.min(1, chunk.score + hits * 0.03) : chunk.score * 0.4;
    return { chunk, adjusted };
  });

  return scored
    .sort((a, b) => b.adjusted - a.adjusted)
    .slice(0, limit)
    .map(({ chunk, adjusted }) => ({ ...chunk, score: parseFloat(adjusted.toFixed(3)) }));
}
