# embed-worker

Python 3.12 worker that extracts text from discovered files, chunks it, and stores to PostgreSQL (and later Qdrant).

## Responsibilities
- Consume `FileDiscoveredMessage` from `kms.embed` queue
- Extract text from supported file types (PDF, DOCX, TXT, MD)
- Chunk text with configurable size and overlap
- Upsert into `kms.files.extracted_text` with FTS vector update
- (Future Sprint 3) Generate embeddings and upsert to Qdrant

## Port
8011 — FastAPI health endpoints only

## Adding a New Extractor
```python
# app/extractors/my_type.py
class MyTypeExtractor(BaseExtractor):
    supported_mime_types = ["application/my-type"]
    async def extract(self, file_path: Path) -> str: ...

# app/extractors/registry.py — add to _register_all()
```

## Error Codes
| Code | Meaning |
|------|---------|
| EMB1000 | Invalid message payload |
| EMB2000 | Text extraction failed |
| EMB3000 | Chunking error |
| EMB4000 | Database write failed |
| EMB5000 | Qdrant upsert failed |
