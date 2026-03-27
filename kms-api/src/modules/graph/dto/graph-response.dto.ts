/**
 * @file graph-response.dto.ts
 * @description Response DTOs and interfaces for the Graph REST API.
 *
 * These types model the data returned from Neo4j and are serialised directly
 * to JSON by the NestJS response pipeline. All fields are optional-safe: a
 * missing Neo4j property surfaces as a typed default (empty string / 0) rather
 * than `undefined`, which prevents runtime serialisation surprises.
 */

import { ApiProperty } from '@nestjs/swagger';

// ---------------------------------------------------------------------------
// Primitive graph shapes
// ---------------------------------------------------------------------------

/**
 * A single entity node extracted from the knowledge graph.
 *
 * Entities are named concepts (people, places, organisations, technologies, …)
 * that appear across one or more documents. `degree` reflects how many File
 * nodes mention this entity — a proxy for its importance in the corpus.
 */
export class GraphEntity {
  /** Neo4j node identity (string-serialised integer or UUID stored on the node). */
  @ApiProperty({ description: 'Unique entity identifier', example: 'ent-abc123' })
  id: string;

  /** Human-readable entity name as stored in the graph (e.g. "TypeScript"). */
  @ApiProperty({ description: 'Entity name', example: 'TypeScript' })
  name: string;

  /** Entity category: PERSON, ORGANISATION, TECHNOLOGY, CONCEPT, … */
  @ApiProperty({ description: 'Entity type/category', example: 'TECHNOLOGY' })
  type: string;

  /**
   * Number of File nodes that contain a `:MENTIONS` edge pointing to this entity.
   * Higher values indicate more commonly referenced entities in the corpus.
   */
  @ApiProperty({ description: 'Number of files that mention this entity', example: 42 })
  degree: number;
}

/**
 * Lightweight reference to a file node — used when returning related files
 * alongside an entity without sending the full file payload.
 */
export class GraphFileRef {
  /** KMS file ID (matches `kms_id` property on the Neo4j File node). */
  @ApiProperty({ description: 'KMS file ID', example: 'file-uuid-here' })
  id: string;

  /** Original filename or document title stored in the graph. */
  @ApiProperty({ description: 'File name or document title', example: 'architecture-doc.pdf' })
  name: string;
}

// ---------------------------------------------------------------------------
// Endpoint response shapes
// ---------------------------------------------------------------------------

/**
 * Response for `GET /graph/entities`.
 * Returns the top-N most-connected entities for the authenticated user.
 */
export class EntitiesResponse {
  /** Ordered list of entities, descending by degree. */
  @ApiProperty({ type: [GraphEntity], description: 'List of entities ordered by degree' })
  entities: GraphEntity[];

  /** Total number of entities returned (same as entities.length — included for API consistency). */
  @ApiProperty({ description: 'Total number of entities returned', example: 50 })
  total: number;
}

/**
 * Response for `GET /graph/entity/:id/related`.
 *
 * Returns the focal entity plus:
 * - `relatedFiles`: files that mention this entity
 * - `coOccurring`: other entities that share at least one file with this entity
 */
export class GraphRelated {
  /** The focal entity itself. */
  @ApiProperty({ type: GraphEntity, description: 'The requested entity' })
  entity: GraphEntity;

  /** Files in which this entity appears. */
  @ApiProperty({ type: [GraphFileRef], description: 'Files that mention this entity' })
  relatedFiles: GraphFileRef[];

  /**
   * Other entities that co-occur with the focal entity in at least one file.
   * Useful for surfacing thematic clusters or topic neighbourhoods.
   */
  @ApiProperty({ type: [GraphEntity], description: 'Entities that co-occur with this entity' })
  coOccurring: GraphEntity[];
}

/**
 * Response for `GET /graph/file/:fileId/neighbors`.
 *
 * Returns the set of entities mentioned in a specific file, forming the
 * immediate neighbourhood of that file in the knowledge graph.
 */
export class GraphNeighbors {
  /** KMS ID of the queried file. */
  @ApiProperty({ description: 'The queried file ID', example: 'file-uuid-here' })
  fileId: string;

  /** Display name of the queried file. */
  @ApiProperty({ description: 'The queried file name', example: 'report-q1.pdf' })
  fileName: string;

  /** Entities extracted from this file. */
  @ApiProperty({ type: [GraphEntity], description: 'Entities mentioned in this file' })
  entities: GraphEntity[];
}

/**
 * Response for `GET /graph/path?from=&to=`.
 *
 * Returns the shortest conceptual path between two entities through the graph.
 * `nodes` is ordered: first node = `from`, last node = `to`.
 * An empty `nodes` array means no path was found.
 */
export class GraphPath {
  /**
   * Ordered sequence of entity nodes forming the path.
   * Includes both the source and target entities.
   */
  @ApiProperty({ type: [GraphEntity], description: 'Ordered nodes along the shortest path' })
  nodes: GraphEntity[];

  /** Number of hops between the source and target entities (nodes.length - 1). */
  @ApiProperty({ description: 'Path length in hops', example: 3 })
  length: number;
}
