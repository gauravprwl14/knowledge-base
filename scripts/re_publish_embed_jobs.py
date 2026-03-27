#!/usr/bin/env python3
"""
One-time script: re-publish all PENDING Google Drive files to kms.embed.

Usage:
    DATABASE_URL="postgresql://..." RABBITMQ_URL="amqp://..." SOURCE_ID="<uuid>" \
        python3 scripts/re_publish_embed_jobs.py

Env vars:
    DATABASE_URL     asyncpg connection string (required)
    RABBITMQ_URL     aio-pika connection string (required)
    SOURCE_ID        kms_sources.id to re-publish (required)
    EMBED_QUEUE      target queue name (default: kms.embed)
    BATCH_SIZE       progress-print interval (default: 100)

This directly reads kms_files WHERE status='PENDING' and publishes
FileDiscoveredMessage payloads to kms.embed, bypassing a full Drive re-scan.
"""
import asyncio
import json
import os
import sys
import uuid

import aio_pika
import asyncpg

DATABASE_URL = os.environ.get("DATABASE_URL", "")
RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "")
EMBED_QUEUE = os.environ.get("EMBED_QUEUE", "kms.embed")
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "100"))
SOURCE_ID = os.environ.get("SOURCE_ID", "")

if not DATABASE_URL or not RABBITMQ_URL or not SOURCE_ID:
    print(
        "ERROR: DATABASE_URL, RABBITMQ_URL, and SOURCE_ID env vars are required.",
        file=sys.stderr,
    )
    sys.exit(1)


async def main() -> None:
    db = await asyncpg.connect(DATABASE_URL)
    mq = await aio_pika.connect_robust(RABBITMQ_URL)
    channel = await mq.channel()

    # Queue already exists with TTL args — don't re-declare, just publish

    # Fetch all PENDING files for the Google Drive source
    rows = await db.fetch(
        """
        SELECT f.id, f.external_id, f.name, f.path, f.mime_type,
               f.size_bytes, f.checksum_sha256, s.user_id, s.type AS source_type
        FROM kms_files f
        JOIN kms_sources s ON s.id = f.source_id
        WHERE f.source_id = $1::uuid
          AND f.status = 'PENDING'::"FileStatus"
        ORDER BY f.created_at
        """,
        SOURCE_ID,
    )

    total = len(rows)
    print(f"Publishing {total} files to {EMBED_QUEUE} ...", flush=True)

    scan_job_id = str(uuid.uuid4())  # shared job id for this re-embed run

    published = 0
    for row in rows:
        payload = {
            "scan_job_id": scan_job_id,
            "source_id": SOURCE_ID,
            "user_id": str(row["user_id"]),
            "file_path": row["path"] or row["external_id"] or "",
            "original_filename": row["name"] or row["external_id"] or "",
            "mime_type": row["mime_type"] or "application/octet-stream",
            "file_size_bytes": int(row["size_bytes"]) if row["size_bytes"] else None,
            "checksum_sha256": row["checksum_sha256"],
            "source_type": str(row["source_type"]),
            "source_metadata": {
                "file_id": str(row["id"]),
                "external_id": row["external_id"],
            },
        }
        await channel.default_exchange.publish(
            aio_pika.Message(
                body=json.dumps(payload).encode(),
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            ),
            routing_key=EMBED_QUEUE,
        )
        published += 1
        if published % BATCH_SIZE == 0:
            print(f"  {published}/{total} published...", flush=True)

    print(f"Done. Published {published} messages to kms.embed.", flush=True)
    await mq.close()
    await db.close()


if __name__ == "__main__":
    asyncio.run(main())
