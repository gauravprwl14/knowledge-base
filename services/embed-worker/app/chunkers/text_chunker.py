from app.models.messages import TextChunk
from app.config import get_settings

settings = get_settings()

def chunk_text(text: str) -> list[TextChunk]:
    """
    Split text into overlapping chunks for embedding.
    Uses character-level splitting with word boundary awareness.
    """
    chunks: list[TextChunk] = []
    size = settings.chunk_size
    overlap = settings.chunk_overlap

    if not text.strip():
        return chunks

    start = 0
    idx = 0
    while start < len(text):
        end = min(start + size, len(text))

        # Extend to next word boundary to avoid splitting mid-word
        if end < len(text):
            while end < len(text) and not text[end].isspace():
                end += 1

        chunk_text_val = text[start:end].strip()
        if chunk_text_val:
            chunks.append(TextChunk(
                chunk_index=idx,
                text=chunk_text_val,
                start_char=start,
                end_char=end,
                token_count=len(chunk_text_val.split()),
            ))
            idx += 1

        start = end - overlap
        if start <= 0 or start >= len(text):
            break

    return chunks
