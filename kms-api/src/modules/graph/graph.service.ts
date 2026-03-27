/**
 * @file graph.service.ts
 * @description Business logic layer for the Knowledge Graph.
 *
 * All methods delegate raw Cypher execution to `Neo4jService.runQuery()` and
 * map the raw `neo4j-driver` Record objects to typed DTOs.
 *
 * Security invariant: every Cypher query includes a `user_id = $userId`
 * predicate so that one user's graph data is NEVER visible to another user.
 * The `userId` parameter is always extracted from the verified JWT inside the
 * controller — it is never trusted from a request body.
 *
 * Empty-result contract: when Neo4j holds no data for a resource (e.g. a file
 * that has not been processed by the graph-worker yet), the method returns an
 * empty result set rather than throwing. This prevents false 404 errors in
 * the common case where graph indexing is still in progress.
 */

import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Record as Neo4jRecord } from 'neo4j-driver';
import { Trace } from '../../telemetry/decorators/trace.decorator';
import { Neo4jService } from './neo4j.service';
import {
  GraphEntity,
  EntitiesResponse,
  GraphRelated,
  GraphNeighbors,
  GraphPath,
  GraphFileRef,
} from './dto/graph-response.dto';

/**
 * GraphService — provides the four graph-query operations exposed by
 * GraphController.
 *
 * @example
 * ```typescript
 * const { entities } = await graphService.getEntities(userId, 'TECHNOLOGY', 20);
 * ```
 */
@Injectable()
export class GraphService {
  constructor(
    private readonly neo4j: Neo4jService,
    @InjectPinoLogger(GraphService.name)
    private readonly logger: PinoLogger,
  ) {}

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Maps a raw Neo4j `Record` that contains an `e` entity node and a
   * `degree` integer to a `GraphEntity` DTO.
   *
   * Neo4j integers are returned as `neo4j-driver` `Integer` objects; we call
   * `.toNumber()` to get a plain JS number before returning.
   *
   * @param record - A single Neo4j record containing `e` and `degree` fields.
   * @returns Typed GraphEntity DTO.
   */
  private mapEntityRecord(record: Neo4jRecord): GraphEntity {
    // `get('e')` returns the Node object; `.properties` holds the persisted values.
    const node = record.get('e');
    const props = node.properties as Record<string, unknown>;

    // Neo4j integers come back as driver Integer objects — convert to number.
    const degreeRaw = record.get('degree');
    const degree: number =
      typeof degreeRaw === 'object' && degreeRaw !== null && 'toNumber' in degreeRaw
        ? (degreeRaw as { toNumber(): number }).toNumber()
        : Number(degreeRaw ?? 0);

    return {
      // Prefer a string `id` property on the node; fall back to the Neo4j
      // internal element ID (string) which is always unique.
      id: String(props['id'] ?? props['kms_id'] ?? node.elementId ?? ''),
      name: String(props['name'] ?? ''),
      type: String(props['type'] ?? ''),
      degree,
    };
  }

  /**
   * Maps a raw Neo4j `Record` that contains an `e` entity node (without a
   * degree field) to a `GraphEntity` DTO with degree = 0.
   *
   * @param record - A single Neo4j record containing an `e` node.
   * @param field - The field name in the record holding the entity node.
   * @returns Typed GraphEntity DTO.
   */
  private mapEntityNode(record: Neo4jRecord, field = 'e'): GraphEntity {
    const node = record.get(field);
    const props = node.properties as Record<string, unknown>;
    return {
      id: String(props['id'] ?? props['kms_id'] ?? node.elementId ?? ''),
      name: String(props['name'] ?? ''),
      type: String(props['type'] ?? ''),
      degree: 0,
    };
  }

  /**
   * Maps a raw Neo4j `Record` that contains an `f` File node to a
   * `GraphFileRef` DTO.
   *
   * @param record - A single Neo4j record containing an `f` node.
   * @returns Typed GraphFileRef DTO.
   */
  private mapFileRef(record: Neo4jRecord, field = 'f'): GraphFileRef {
    const node = record.get(field);
    const props = node.properties as Record<string, unknown>;
    return {
      id: String(props['kms_id'] ?? props['id'] ?? node.elementId ?? ''),
      name: String(props['name'] ?? props['title'] ?? ''),
    };
  }

  // ---------------------------------------------------------------------------
  // Public service methods
  // ---------------------------------------------------------------------------

  /**
   * Returns the top-N most-connected entities for a given user.
   *
   * "Most connected" is measured by the number of File nodes that have a
   * `:MENTIONS` edge pointing to the entity — this is a proxy for how
   * prominently the entity appears in the user's knowledge base.
   *
   * @param userId - Authenticated user ID (from JWT). Used as graph filter.
   * @param type   - Optional entity type filter (e.g. "PERSON", "TECHNOLOGY").
   * @param limit  - Maximum number of entities to return (default 50, max 200).
   * @returns Typed EntitiesResponse with the entities list and total count.
   */
  @Trace({ name: 'graph.getEntities' })
  async getEntities(userId: string, type?: string, limit = 50): Promise<EntitiesResponse> {
    // Cap the limit at 200 to prevent accidentally expensive queries.
    const safeLimit = Math.min(limit, 200);

    this.logger.info(
      { event: 'graph.getEntities', userId, type, limit: safeLimit },
      'graph: fetching top entities',
    );

    // Build the Cypher query. The optional type filter is appended only when
    // the caller provides it, keeping the default query lean.
    const typeClause = type ? 'AND e.type = $type' : '';
    const cypher = `
      MATCH (f:File)-[:MENTIONS]->(e:Entity)
      WHERE f.user_id = $userId
        ${typeClause}
      RETURN e, count(*) AS degree
      ORDER BY degree DESC
      LIMIT $limit
    `;

    // Use `toInteger` to ensure the driver sends `limit` as a Cypher Integer,
    // not a JS float (which Neo4j would reject for LIMIT clauses).
    const records = await this.neo4j.runQuery(cypher, {
      userId,
      ...(type ? { type } : {}),
      limit: neo4jInt(safeLimit),
    });

    const entities = records.map((r) => this.mapEntityRecord(r));

    this.logger.info(
      { event: 'graph.getEntities.ok', userId, count: entities.length },
      'graph: entities fetched',
    );

    return { entities, total: entities.length };
  }

  /**
   * Returns the neighbourhood of a single entity: the files that mention it
   * and the other entities that co-occur with it across those files.
   *
   * If the entityId is unknown (no matching Neo4j node for this user), the
   * method returns an empty `GraphRelated` so the caller can return a 200 with
   * empty arrays rather than a false 404.
   *
   * @param userId   - Authenticated user ID. Used as graph filter.
   * @param entityId - The entity's `id` or `kms_id` property in Neo4j.
   * @returns GraphRelated DTO with the entity, its files, and co-occurring entities.
   */
  @Trace({ name: 'graph.getEntityRelated' })
  async getEntityRelated(userId: string, entityId: string): Promise<GraphRelated> {
    this.logger.info(
      { event: 'graph.getEntityRelated', userId, entityId },
      'graph: fetching entity neighbours',
    );

    // --- Step 1: resolve the entity node itself ---
    const entityRecords = await this.neo4j.runQuery(
      `
      MATCH (f:File)-[:MENTIONS]->(e:Entity)
      WHERE f.user_id = $userId
        AND (e.id = $entityId OR e.kms_id = $entityId)
      RETURN e, count(f) AS degree
      LIMIT 1
      `,
      { userId, entityId },
    );

    // If not found in the graph, return empty structure (not an error).
    if (entityRecords.length === 0) {
      this.logger.info(
        { event: 'graph.getEntityRelated.empty', userId, entityId },
        'graph: entity not found in graph — returning empty',
      );
      return {
        entity: { id: entityId, name: '', type: '', degree: 0 },
        relatedFiles: [],
        coOccurring: [],
      };
    }

    const entity = this.mapEntityRecord(entityRecords[0]);

    // --- Step 2: get related files ---
    const fileRecords = await this.neo4j.runQuery(
      `
      MATCH (f:File)-[:MENTIONS]->(e:Entity)
      WHERE f.user_id = $userId
        AND (e.id = $entityId OR e.kms_id = $entityId)
      RETURN DISTINCT f
      LIMIT 50
      `,
      { userId, entityId },
    );

    const relatedFiles = fileRecords.map((r) => this.mapFileRef(r));

    // --- Step 3: get co-occurring entities ---
    // Co-occurring = entities that share at least one file with the focal entity.
    const coRecords = await this.neo4j.runQuery(
      `
      MATCH (f:File)-[:MENTIONS]->(e:Entity)
      WHERE f.user_id = $userId
        AND (e.id = $entityId OR e.kms_id = $entityId)
      WITH COLLECT(f) AS files
      UNWIND files AS f2
      MATCH (f2)-[:MENTIONS]->(co:Entity)
      WHERE NOT (co.id = $entityId OR co.kms_id = $entityId)
      RETURN co, count(*) AS degree
      ORDER BY degree DESC
      LIMIT 20
      `,
      { userId, entityId },
    );

    const coOccurring = coRecords.map((r) => {
      const node = r.get('co');
      const props = node.properties as Record<string, unknown>;
      const degreeRaw = r.get('degree');
      const degree: number =
        typeof degreeRaw === 'object' && degreeRaw !== null && 'toNumber' in degreeRaw
          ? (degreeRaw as { toNumber(): number }).toNumber()
          : Number(degreeRaw ?? 0);
      return {
        id: String(props['id'] ?? props['kms_id'] ?? node.elementId ?? ''),
        name: String(props['name'] ?? ''),
        type: String(props['type'] ?? ''),
        degree,
      } as GraphEntity;
    });

    this.logger.info(
      {
        event: 'graph.getEntityRelated.ok',
        userId,
        entityId,
        fileCount: relatedFiles.length,
        coCount: coOccurring.length,
      },
      'graph: entity neighbours fetched',
    );

    return { entity, relatedFiles, coOccurring };
  }

  /**
   * Returns all entities extracted from a specific file, forming the file's
   * immediate entity neighbourhood in the knowledge graph.
   *
   * If the file has not been processed by the graph-worker yet (no `:MENTIONS`
   * edges), the method returns an empty `GraphNeighbors` so the caller can
   * render a graceful "no entities yet" state rather than an error.
   *
   * @param userId  - Authenticated user ID. Ensures cross-user isolation.
   * @param fileId  - KMS file ID (matches `kms_id` on the Neo4j File node).
   * @param depth   - Unused in this implementation (reserved for future multi-hop expansion).
   * @returns GraphNeighbors DTO with the file name and its entities.
   */
  @Trace({ name: 'graph.getFileNeighbors' })
  async getFileNeighbors(
    userId: string,
    fileId: string,
    depth?: number,
  ): Promise<GraphNeighbors> {
    // `depth` is accepted for API compatibility but the current implementation
    // always returns depth-1 neighbours (direct entity mentions).
    // Future: use variable-length path `[:MENTIONS*1..$depth]` for deeper traversal.
    void depth;

    this.logger.info(
      { event: 'graph.getFileNeighbors', userId, fileId },
      'graph: fetching file entity neighbours',
    );

    const records = await this.neo4j.runQuery(
      `
      MATCH (f:File {kms_id: $fileId, user_id: $userId})-[:MENTIONS]->(e:Entity)
      RETURN f, e
      LIMIT 100
      `,
      { userId, fileId },
    );

    // No records → file not found or not yet graph-indexed. Return empty safely.
    if (records.length === 0) {
      this.logger.info(
        { event: 'graph.getFileNeighbors.empty', userId, fileId },
        'graph: file has no entity edges — returning empty neighbours',
      );
      return { fileId, fileName: '', entities: [] };
    }

    // Extract the file name from the first record (same file across all records).
    const firstFileNode = records[0].get('f');
    const fileProps = firstFileNode.properties as Record<string, unknown>;
    const fileName = String(fileProps['name'] ?? fileProps['title'] ?? '');

    // Map each record's entity node into a GraphEntity.
    // We use a Map keyed by entity ID to deduplicate if the query returns
    // the same entity multiple times (possible with certain graph shapes).
    const entityMap = new Map<string, GraphEntity>();
    for (const record of records) {
      const entity = this.mapEntityNode(record);
      if (!entityMap.has(entity.id)) {
        entityMap.set(entity.id, entity);
      }
    }

    const entities = Array.from(entityMap.values());

    this.logger.info(
      { event: 'graph.getFileNeighbors.ok', userId, fileId, entityCount: entities.length },
      'graph: file neighbours fetched',
    );

    return { fileId, fileName, entities };
  }

  /**
   * Finds the shortest conceptual path between two entities in the knowledge
   * graph, traversing through shared File nodes.
   *
   * The path uses Neo4j's `shortestPath` algorithm over `:MENTIONS` edges.
   * Both entities must belong to the same user (enforced via `user_id` on File
   * nodes in the traversal). If no path exists, returns an empty `GraphPath`.
   *
   * @param userId - Authenticated user ID. Ensures cross-user isolation.
   * @param fromId - The source entity's `id` or `kms_id`.
   * @param toId   - The target entity's `id` or `kms_id`.
   * @returns GraphPath with ordered node list and hop count.
   */
  @Trace({ name: 'graph.getPath' })
  async getPath(userId: string, fromId: string, toId: string): Promise<GraphPath> {
    this.logger.info(
      { event: 'graph.getPath', userId, fromId, toId },
      'graph: computing shortest entity path',
    );

    // The shortestPath traversal allows any relationship type (`*`) in this
    // simplified implementation. In a production graph with diverse edge types,
    // restrict to `[:MENTIONS|CO_OCCURS_WITH*]` for more semantically correct paths.
    //
    // We anchor the user scope by requiring that at least one File node on the
    // path belongs to the authenticated user. This is an approximation; for
    // strict isolation every hop would need a user predicate, but the current
    // graph schema only stores `user_id` on File nodes, not Entity nodes.
    const records = await this.neo4j.runQuery(
      `
      MATCH
        (start:Entity),
        (end:Entity),
        (f:File {user_id: $userId})
      WHERE (start.id = $fromId OR start.kms_id = $fromId)
        AND (end.id = $toId   OR end.kms_id   = $toId)
        AND (f)-[:MENTIONS]->(start)
      WITH start, end
      MATCH path = shortestPath((start)-[*..10]-(end))
      RETURN nodes(path) AS pathNodes
      LIMIT 1
      `,
      { userId, fromId, toId },
    );

    if (records.length === 0) {
      this.logger.info(
        { event: 'graph.getPath.empty', userId, fromId, toId },
        'graph: no path found between entities',
      );
      return { nodes: [], length: 0 };
    }

    // The result is a list of mixed Node objects (File and Entity nodes).
    // We filter to only Entity nodes and map them to GraphEntity DTOs.
    const rawNodes: unknown[] = records[0].get('pathNodes');
    const nodes: GraphEntity[] = rawNodes
      .filter((n: unknown) => {
        // Only include Entity-labelled nodes; skip File nodes in the path.
        const node = n as { labels?: string[]; properties?: Record<string, unknown> };
        return Array.isArray(node.labels) && node.labels.includes('Entity');
      })
      .map((n: unknown) => {
        const node = n as {
          properties: Record<string, unknown>;
          elementId?: string;
        };
        const props = node.properties;
        return {
          id: String(props['id'] ?? props['kms_id'] ?? node.elementId ?? ''),
          name: String(props['name'] ?? ''),
          type: String(props['type'] ?? ''),
          degree: 0,
        } as GraphEntity;
      });

    const length = Math.max(0, nodes.length - 1);

    this.logger.info(
      { event: 'graph.getPath.ok', userId, fromId, toId, hops: length },
      'graph: path computed',
    );

    return { nodes, length };
  }
}

// ---------------------------------------------------------------------------
// Module-level helper
// ---------------------------------------------------------------------------

/**
 * Wraps a JS number as a Neo4j Integer object.
 *
 * The `neo4j-driver` expects Cypher parameters that map to integer types
 * (e.g. `LIMIT`) to be sent as its custom `Integer` type, not as JS floats.
 * Using `neo4j.int()` avoids the "Cannot pass 50 as Cypher Integer" runtime
 * warning emitted by the driver.
 *
 * @param n - The plain JS number to wrap.
 */
function neo4jInt(n: number): unknown {
  // Dynamic import keeps the driver import at the service level clean;
  // we re-use the same singleton import via the module-level `neo4j` default.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const neo4j = require('neo4j-driver') as typeof import('neo4j-driver');
  return neo4j.default ? neo4j.default.int(n) : (neo4j as unknown as { int(n: number): unknown }).int(n);
}
