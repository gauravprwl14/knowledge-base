# Text Chunking Algorithm

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Problem Statement

Large documents cannot be embedded as a single unit due to:
1. Model token limits (typically 256-512 tokens)
2. Loss of semantic precision in long texts
3. Memory constraints during processing

The chunking algorithm must split documents into smaller pieces while:
- Preserving semantic meaning
- Maintaining context through overlaps
- Respecting natural boundaries (paragraphs, sentences)

---

## Conceptual Algorithm

```
ALGORITHM: Semantic Text Chunking
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INPUT:
  text         : String        // Raw document text
  chunk_size   : Integer       // Target chunk size in characters (default: 1000)
  overlap      : Integer       // Overlap between chunks (default: 200)
  min_size     : Integer       // Minimum chunk size (default: 100)

OUTPUT:
  chunks       : List[Chunk]   // List of text chunks with metadata

PROCEDURE chunk(text, chunk_size, overlap, min_size):

  1. PREPROCESS TEXT
     ─────────────────
     text ← normalize_whitespace(text)
     text ← remove_control_characters(text)
     text ← trim(text)

     IF length(text) ≤ chunk_size THEN
       RETURN [Chunk(text, index=0, start=0, end=length(text))]
     END IF

  2. SPLIT INTO PARAGRAPHS
     ───────────────────────
     paragraphs ← split_by_pattern(text, "\n\s*\n")
     paragraphs ← filter(p → length(trim(p)) > 0, paragraphs)

  3. INITIALIZE STATE
     ─────────────────
     chunks ← []
     current_chunk ← []
     current_length ← 0
     current_start ← 0
     char_position ← 0

  4. BUILD CHUNKS
     ─────────────
     FOR EACH paragraph IN paragraphs DO

       para_length ← length(paragraph)

       IF current_length + para_length ≤ chunk_size THEN
         // Paragraph fits in current chunk
         append(current_chunk, paragraph)
         current_length ← current_length + para_length + 1

       ELSE IF para_length > chunk_size THEN
         // Paragraph too large - must split
         IF length(current_chunk) > 0 THEN
           // Yield current chunk first
           chunk_text ← join(current_chunk, "\n")
           IF length(chunk_text) ≥ min_size THEN
             append(chunks, Chunk(
               text = chunk_text,
               index = length(chunks),
               start = current_start,
               end = current_start + length(chunk_text)
             ))
           END IF
         END IF

         // Split large paragraph into sub-chunks
         sub_chunks ← split_large_paragraph(paragraph, chunk_size, overlap)
         FOR EACH sub IN sub_chunks DO
           append(chunks, sub)
         END FOR

         // Reset state
         current_chunk ← []
         current_length ← 0
         current_start ← char_position + para_length

       ELSE
         // Start new chunk with overlap
         IF length(current_chunk) > 0 THEN
           chunk_text ← join(current_chunk, "\n")
           IF length(chunk_text) ≥ min_size THEN
             append(chunks, Chunk(
               text = chunk_text,
               index = length(chunks),
               start = current_start,
               end = current_start + length(chunk_text)
             ))
           END IF

           // Calculate overlap
           overlap_text ← get_overlap(current_chunk, overlap)
           current_start ← char_position - length(overlap_text)
           current_chunk ← [overlap_text, paragraph]
           current_length ← length(overlap_text) + para_length
         ELSE
           current_chunk ← [paragraph]
           current_length ← para_length
         END IF
       END IF

       char_position ← char_position + para_length + 1

     END FOR

  5. YIELD FINAL CHUNK
     ──────────────────
     IF length(current_chunk) > 0 THEN
       chunk_text ← join(current_chunk, "\n")
       IF length(chunk_text) ≥ min_size THEN
         append(chunks, Chunk(
           text = chunk_text,
           index = length(chunks),
           start = current_start,
           end = current_start + length(chunk_text)
         ))
       ELSE IF length(chunks) > 0 THEN
         // Merge small final chunk with previous
         last_chunk ← chunks[length(chunks) - 1]
         last_chunk.text ← last_chunk.text + "\n" + chunk_text
         last_chunk.end ← current_start + length(chunk_text)
       END IF
     END IF

  6. RETURN chunks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HELPER: get_overlap(chunk_parts, overlap_size)
  full_text ← join(chunk_parts, "\n")
  IF length(full_text) ≤ overlap_size THEN
    RETURN full_text
  END IF

  overlap ← substring(full_text, length(full_text) - overlap_size)
  // Don't split in middle of word
  first_space ← find_first(overlap, " ")
  IF first_space > 0 THEN
    overlap ← substring(overlap, first_space + 1)
  END IF

  RETURN overlap

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HELPER: split_large_paragraph(paragraph, chunk_size, overlap)
  // Split by sentences
  sentences ← split_by_pattern(paragraph, "(?<=[.!?])\s+")
  chunks ← []
  current ← ""

  FOR EACH sentence IN sentences DO
    IF length(current) + length(sentence) ≤ chunk_size THEN
      current ← current + " " + sentence
    ELSE
      IF length(current) > 0 THEN
        append(chunks, current)
      END IF
      current ← sentence
    END IF
  END FOR

  IF length(current) > 0 THEN
    append(chunks, current)
  END IF

  RETURN chunks
```

---

## High-Level Implementation

```python
# app/chunking/semantic.py - NOT executable - conceptual implementation

import re
from typing import List, Iterator
from dataclasses import dataclass

@dataclass
class TextChunk:
    """A chunk of text with position metadata"""
    text: str
    index: int
    start_char: int
    end_char: int
    metadata: dict = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class SemanticChunker:
    """
    Semantic text chunking that respects document structure.

    The algorithm:
    1. Splits text into paragraphs (natural semantic units)
    2. Groups paragraphs into chunks up to max size
    3. Adds overlap between chunks for context continuity
    4. Handles edge cases (large paragraphs, small finals)
    """

    # Pattern for paragraph boundaries
    PARAGRAPH_PATTERN = re.compile(r'\n\s*\n')

    # Pattern for sentence boundaries
    SENTENCE_PATTERN = re.compile(r'(?<=[.!?])\s+(?=[A-Z])')

    def __init__(
        self,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        min_chunk_size: int = 100
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.min_chunk_size = min_chunk_size

    def chunk(self, text: str, metadata: dict = None) -> List[TextChunk]:
        """
        Split text into semantic chunks.

        Args:
            text: Raw document text
            metadata: Optional metadata to attach to all chunks

        Returns:
            List of TextChunk objects
        """
        # Step 1: Preprocess
        text = self._preprocess(text)

        # Handle small documents
        if len(text) <= self.chunk_size:
            return [TextChunk(
                text=text,
                index=0,
                start_char=0,
                end_char=len(text),
                metadata=self._build_metadata(metadata, total_chunks=1)
            )]

        # Step 2: Split into paragraphs
        paragraphs = self._split_paragraphs(text)

        # Step 3: Build chunks
        chunks = list(self._build_chunks(paragraphs, text))

        # Step 4: Add metadata
        for i, chunk in enumerate(chunks):
            chunk.index = i
            chunk.metadata = self._build_metadata(metadata, total_chunks=len(chunks))

        return chunks

    def _preprocess(self, text: str) -> str:
        """Normalize text before chunking"""
        # Normalize whitespace (but preserve paragraph breaks)
        text = re.sub(r'[ \t]+', ' ', text)
        # Remove control characters except newlines
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
        return text.strip()

    def _split_paragraphs(self, text: str) -> List[str]:
        """Split text into paragraphs"""
        paragraphs = self.PARAGRAPH_PATTERN.split(text)
        return [p.strip() for p in paragraphs if p.strip()]

    def _build_chunks(
        self,
        paragraphs: List[str],
        original_text: str
    ) -> Iterator[TextChunk]:
        """Build overlapping chunks from paragraphs"""

        current_parts = []
        current_length = 0
        current_start = 0
        char_position = 0

        for paragraph in paragraphs:
            para_length = len(paragraph)

            if current_length + para_length <= self.chunk_size:
                # Fits in current chunk
                current_parts.append(paragraph)
                current_length += para_length + 1  # +1 for separator

            elif para_length > self.chunk_size:
                # Paragraph too large - yield current and split paragraph
                if current_parts:
                    chunk = self._create_chunk(current_parts, current_start)
                    if len(chunk.text) >= self.min_chunk_size:
                        yield chunk

                # Split large paragraph
                for sub_chunk in self._split_large_paragraph(paragraph):
                    yield TextChunk(
                        text=sub_chunk,
                        index=0,
                        start_char=char_position,
                        end_char=char_position + len(sub_chunk)
                    )

                current_parts = []
                current_length = 0
                current_start = char_position + para_length

            else:
                # Start new chunk with overlap
                if current_parts:
                    chunk = self._create_chunk(current_parts, current_start)
                    if len(chunk.text) >= self.min_chunk_size:
                        yield chunk

                    # Get overlap from end of previous chunk
                    overlap_text = self._get_overlap(current_parts)
                    current_start = char_position - len(overlap_text)
                    current_parts = [overlap_text, paragraph] if overlap_text else [paragraph]
                    current_length = len(overlap_text) + para_length
                else:
                    current_parts = [paragraph]
                    current_length = para_length

            char_position += para_length + 1

        # Yield final chunk
        if current_parts:
            chunk = self._create_chunk(current_parts, current_start)
            if len(chunk.text) >= self.min_chunk_size:
                yield chunk

    def _create_chunk(self, parts: List[str], start: int) -> TextChunk:
        """Create a chunk from parts"""
        text = '\n'.join(parts)
        return TextChunk(
            text=text,
            index=0,
            start_char=start,
            end_char=start + len(text)
        )

    def _get_overlap(self, parts: List[str]) -> str:
        """Extract overlap text from end of chunk"""
        if not parts:
            return ""

        full_text = '\n'.join(parts)
        if len(full_text) <= self.chunk_overlap:
            return full_text

        # Take last N characters
        overlap = full_text[-self.chunk_overlap:]

        # Don't split in middle of word
        first_space = overlap.find(' ')
        if first_space > 0:
            overlap = overlap[first_space + 1:]

        return overlap

    def _split_large_paragraph(self, paragraph: str) -> List[str]:
        """Split a paragraph that exceeds chunk size"""
        sentences = self.SENTENCE_PATTERN.split(paragraph)
        chunks = []
        current = ""

        for sentence in sentences:
            if len(current) + len(sentence) <= self.chunk_size:
                current = f"{current} {sentence}".strip()
            else:
                if current:
                    chunks.append(current)
                current = sentence

        if current:
            chunks.append(current)

        return chunks

    def _build_metadata(self, base: dict, **kwargs) -> dict:
        """Build chunk metadata"""
        result = base.copy() if base else {}
        result.update(kwargs)
        return result
```

---

## Complexity Analysis

| Operation | Time | Space |
|-----------|------|-------|
| Preprocessing | O(n) | O(n) |
| Paragraph splitting | O(n) | O(p) |
| Chunk building | O(p) | O(c) |
| Total | O(n) | O(n) |

Where:
- n = document length in characters
- p = number of paragraphs
- c = number of chunks

---

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `chunk_size` | 1000 | Maximum characters per chunk |
| `chunk_overlap` | 200 | Characters of overlap between chunks |
| `min_chunk_size` | 100 | Minimum chunk size to keep |

### Tuning Guidelines

| Document Type | chunk_size | overlap | Rationale |
|---------------|------------|---------|-----------|
| Legal/Technical | 1500 | 300 | Preserve context |
| Short articles | 800 | 150 | More granular search |
| Code files | 500 | 100 | Function-level chunks |
| Chat logs | 300 | 50 | Message-level chunks |

---

## Edge Cases

| Case | Handling |
|------|----------|
| Empty document | Return empty list |
| Single paragraph < chunk_size | Return single chunk |
| Paragraph > chunk_size | Split by sentences |
| Final chunk < min_size | Merge with previous |
| No paragraph breaks | Split by sentences |
| Unicode text | Preserve character boundaries |

---

## Example

**Input**:
```
This is paragraph one about machine learning. It contains
multiple sentences discussing various concepts.

This is paragraph two about data processing. It also has
several sentences that explain different techniques.

This is paragraph three about system design.
```

**Output** (chunk_size=200, overlap=50):
```
Chunk 0: "This is paragraph one about machine learning. It contains
multiple sentences discussing various concepts."

Chunk 1: "discussing various concepts.

This is paragraph two about data processing. It also has
several sentences that explain different techniques."

Chunk 2: "explain different techniques.

This is paragraph three about system design."
```

Note the overlap between chunks preserving context.

