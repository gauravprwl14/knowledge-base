/**
 * graph.ts — API client for the KMS Graph endpoints.
 *
 * Wraps GET /graph/entities, GET /graph/entity/:id/related, and
 * GET /graph/file/:fileId/neighbors. All types mirror the backend
 * GraphModule DTOs so the compiler enforces the contract at the boundary.
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/**
 * A single named entity extracted from the knowledge base.
 *
 * `degree` is the number of co-occurrence edges the entity has — it is used
 * in the UI to scale node size (higher degree = more prominent node).
 */
export interface GraphEntity {
  /** UUID of the entity record */
  id: string;
  /** Human-readable display name */
  name: string;
  /**
   * NER type tag. Common values: 'PERSON' | 'ORG' | 'GPE' | 'EVENT'
   * The UI maps each type to a colour; unknown types fall back to slate.
   */
  type: string;
  /** Number of edges (co-occurrences) — used for node size scaling */
  degree: number;
}

/**
 * Expanded neighbourhood of a single entity.
 *
 * Returned by GET /graph/entity/:id/related.
 * Contains the focal entity, all files it appears in, and all entities
 * that co-occur with it so the UI can draw edges.
 */
export interface GraphRelated {
  /** The entity whose neighbourhood was requested */
  entity: GraphEntity;
  /** Files in the knowledge base where this entity appears */
  relatedFiles: { id: string; name: string }[];
  /** Other entities that appear in the same documents */
  coOccurring: GraphEntity[];
}

/**
 * All entities extracted from a specific file.
 *
 * Returned by GET /graph/file/:fileId/neighbors.
 */
export interface GraphNeighbors {
  /** UUID of the file */
  fileId: string;
  /** Display name of the file */
  fileName: string;
  /** Entities that appear in this file */
  entities: GraphEntity[];
}

/**
 * Paginated envelope returned by GET /graph/entities.
 */
export interface EntitiesResponse {
  entities: GraphEntity[];
  total: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Fetch a flat list of entities from the knowledge graph.
 *
 * @param type   - Optional NER type filter (e.g. 'PERSON', 'ORG'). Omit to
 *                 return all types.
 * @param limit  - Maximum number of entities to return. Defaults to 50.
 * @returns      A paginated envelope containing the matching entities.
 * @throws       ApiError on any non-2xx response.
 */
export async function getGraphEntities(
  type?: string,
  limit = 50,
): Promise<EntitiesResponse> {
  const params = new URLSearchParams();
  if (type && type !== 'ALL') params.set('type', type);
  params.set('limit', String(limit));
  return apiClient.get<EntitiesResponse>(`/graph/entities?${params}`);
}

/**
 * Fetch the full neighbourhood of a single entity.
 *
 * Used when the user clicks a node in the graph to expand its relationships.
 *
 * @param entityId - UUID of the entity to expand.
 * @returns        The entity, its files, and co-occurring entities.
 * @throws         ApiError on any non-2xx response.
 */
export async function getEntityRelated(entityId: string): Promise<GraphRelated> {
  return apiClient.get<GraphRelated>(`/graph/entity/${entityId}/related`);
}

/**
 * Fetch all entities extracted from a specific file.
 *
 * @param fileId - UUID of the file.
 * @returns      The file metadata and its extracted entities.
 * @throws       ApiError on any non-2xx response.
 */
export async function getFileNeighbors(fileId: string): Promise<GraphNeighbors> {
  return apiClient.get<GraphNeighbors>(`/graph/file/${fileId}/neighbors`);
}
