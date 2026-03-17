/**
 * BullMQ queue name constants used across the KMS API.
 *
 * Queue names follow the convention `kms.{domain}` and must match the names
 * consumed by the corresponding Python AMQP workers.
 *
 * | Constant              | Queue name          | Consumer service   |
 * |-----------------------|---------------------|--------------------|
 * | EMBED_QUEUE           | `kms.embed`         | embed-worker       |
 * | SCAN_QUEUE            | `kms.scan`          | scan-worker        |
 * | GRAPH_QUEUE           | `kms.graph`         | graph-worker       |
 * | TRANSCRIPTION_QUEUE   | `kms.transcription` | voice-app          |
 */

/** Queue consumed by the `embed-worker` to generate BGE-M3 embeddings. */
export const EMBED_QUEUE = 'kms.embed';

/** Queue consumed by the `scan-worker` to discover files from a source. */
export const SCAN_QUEUE = 'kms.scan';

/** Queue consumed by the `graph-worker` to build Neo4j relationships. */
export const GRAPH_QUEUE = 'kms.graph';

/** Queue consumed by the `voice-app` transcription microservice. */
export const TRANSCRIPTION_QUEUE = 'kms.transcription';
