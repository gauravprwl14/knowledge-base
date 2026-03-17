import asyncpg
import structlog
from app.config import get_settings
from app.schemas.chat import Citation

logger = structlog.get_logger(__name__)
settings = get_settings()


class ContextRetriever:
    """Retrieves relevant document chunks for a question using keyword search.
    Future: add vector search + graph traversal."""

    def __init__(self, db_pool: asyncpg.Pool):
        self._db = db_pool

    async def retrieve(self, question: str, max_chunks: int = 10) -> tuple[str, list[Citation]]:
        """Return (formatted_context, citations) for the question."""
        rows = await self._db.fetch("""
            SELECT
                f.id::text AS file_id,
                f.original_filename AS filename,
                ts_headline(
                    'kms_fts', f.extracted_text,
                    plainto_tsquery('kms_fts', $1),
                    'MaxWords=80, MinWords=30, MaxFragments=2'
                ) AS snippet,
                ts_rank_cd(f.fts_vector, plainto_tsquery('kms_fts', $1)) AS score
            FROM kms.files f,
                 plainto_tsquery('kms_fts', $1) query
            WHERE f.fts_vector @@ query
              AND f.deleted_at IS NULL
              AND f.extracted_text IS NOT NULL
            ORDER BY score DESC
            LIMIT $2
        """, question, max_chunks)

        if not rows:
            logger.info("No context found for question", question=question[:100])
            return "", []

        citations = [
            Citation(
                file_id=row["file_id"],
                filename=row["filename"],
                snippet=row["snippet"] or "",
                score=float(row["score"]),
            )
            for row in rows
        ]

        context_parts = [f"[{i+1}] {c.filename}:\n{c.snippet}" for i, c in enumerate(citations)]
        return "\n\n---\n\n".join(context_parts), citations
