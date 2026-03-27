/**
 * @file graph.controller.ts
 * @description REST controller exposing four read-only Neo4j graph endpoints.
 *
 * All routes:
 * - Are protected by `JwtAuthGuard` (enforced via the global guard in
 *   `app.module.ts` — the explicit `@UseGuards` here is defensive redundancy
 *   and makes intent explicit when reading the file in isolation).
 * - Extract the authenticated user ID from `req.user.id` via `@CurrentUser('id')`.
 * - Delegate business logic entirely to `GraphService`.
 * - Return graceful empty results (HTTP 200) when the graph has no data yet,
 *   rather than 404, because graph indexing may lag behind file ingestion.
 *
 * Route prefix `/graph` is registered without the `/api/v1` prefix here;
 * the global prefix is applied in `main.ts`.
 */

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { GraphService } from './graph.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  EntitiesResponse,
  GraphRelated,
  GraphNeighbors,
  GraphPath,
} from './dto/graph-response.dto';

/**
 * GraphController — exposes read-only Neo4j knowledge-graph endpoints.
 *
 * All routes require a valid JWT access token and scope results to the
 * authenticated user so that one user's graph is never visible to another.
 *
 * Routes:
 * - `GET /graph/entities`              — top-N entities by degree
 * - `GET /graph/entity/:id/related`    — entity neighbourhood
 * - `GET /graph/file/:fileId/neighbors`— file entity graph
 * - `GET /graph/path`                  — shortest path between two entities
 */
@ApiTags('Graph')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('graph')
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  // ---------------------------------------------------------------------------
  // GET /graph/entities
  // ---------------------------------------------------------------------------

  /**
   * Returns the top-N most-connected entities for the authenticated user.
   *
   * "Most connected" is measured by the number of files that mention the
   * entity. Optionally filtered by entity type (e.g. PERSON, TECHNOLOGY).
   *
   * Returns HTTP 200 with an empty `entities` array when the user's graph
   * has not been populated yet — this is NOT an error condition.
   *
   * @param userId - Injected from the verified JWT payload.
   * @param type   - Optional entity type filter.
   * @param limit  - Max entities to return (default 50, capped at 200).
   * @returns EntitiesResponse with ordered entity list and count.
   */
  @Get('entities')
  @ApiOperation({
    summary: 'List top entities for the authenticated user',
    description:
      'Returns the N most-connected entities in the user\'s knowledge graph, ' +
      'ordered by the number of files that mention them. ' +
      'Returns an empty list (not 404) when the graph is not yet populated.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by entity type (e.g. PERSON, TECHNOLOGY, CONCEPT)',
    example: 'TECHNOLOGY',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of entities to return (default 50, max 200)',
    example: 50,
  })
  @ApiResponse({ status: 200, description: 'Entity list (may be empty)', type: EntitiesResponse })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 502, description: 'Neo4j query failed (KBGRP0001)' })
  async getEntities(
    @CurrentUser('id') userId: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ): Promise<EntitiesResponse> {
    // Parse the `limit` query param — it arrives as a string from the URL.
    const parsedLimit = limit ? parseInt(limit, 10) : 50;

    // Guard against NaN from malformed query params — fall back to default.
    const safeLimit = Number.isFinite(parsedLimit) ? parsedLimit : 50;

    return this.graphService.getEntities(userId, type, safeLimit);
  }

  // ---------------------------------------------------------------------------
  // GET /graph/entity/:id/related
  // ---------------------------------------------------------------------------

  /**
   * Returns the neighbourhood of a specific entity: the files that mention it
   * and the other entities that co-occur with it.
   *
   * Returns HTTP 200 with empty arrays when the entity is not found in the
   * graph — the entity may exist in PostgreSQL but not yet be indexed in Neo4j.
   *
   * @param userId   - Injected from the verified JWT payload.
   * @param entityId - Path param — the entity's `id` or `kms_id` in Neo4j.
   * @returns GraphRelated DTO.
   */
  @Get('entity/:id/related')
  @ApiOperation({
    summary: 'Get files and co-occurring entities for a specific entity',
    description:
      'Returns the entity node, the files that reference it, and other entities ' +
      'that co-occur with it across those files. ' +
      'Returns an empty result (not 404) when the entity has no graph edges yet.',
  })
  @ApiParam({
    name: 'id',
    description: 'Entity ID (kms_id or Neo4j property id)',
    example: 'ent-abc123',
  })
  @ApiResponse({ status: 200, description: 'Entity neighbourhood (may be empty)', type: GraphRelated })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 502, description: 'Neo4j query failed (KBGRP0001)' })
  async getEntityRelated(
    @CurrentUser('id') userId: string,
    @Param('id') entityId: string,
  ): Promise<GraphRelated> {
    return this.graphService.getEntityRelated(userId, entityId);
  }

  // ---------------------------------------------------------------------------
  // GET /graph/file/:fileId/neighbors
  // ---------------------------------------------------------------------------

  /**
   * Returns all entities extracted from a specific file.
   *
   * Represents the file's immediate neighbourhood in the entity graph.
   * Returns HTTP 200 with an empty `entities` array when the file has not
   * been processed by the graph-worker yet — this is the normal state for
   * newly uploaded files.
   *
   * @param userId  - Injected from the verified JWT payload.
   * @param fileId  - Path param — KMS file ID (must be owned by the user).
   * @param depth   - Optional traversal depth (reserved for future multi-hop).
   * @returns GraphNeighbors DTO.
   */
  @Get('file/:fileId/neighbors')
  @ApiOperation({
    summary: 'Get entities mentioned in a specific file',
    description:
      'Returns the entity neighbourhood of a file — all entities that the ' +
      'graph-worker extracted and linked to this file via :MENTIONS edges. ' +
      'Returns an empty list (not 404) when the file has not been graph-indexed yet.',
  })
  @ApiParam({
    name: 'fileId',
    description: 'KMS file ID (UUID)',
    example: 'file-uuid-here',
  })
  @ApiQuery({
    name: 'depth',
    required: false,
    description: 'Traversal depth (reserved — currently ignored, always 1)',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'File entity neighbourhood (may be empty)',
    type: GraphNeighbors,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 502, description: 'Neo4j query failed (KBGRP0001)' })
  async getFileNeighbors(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
    @Query('depth') depth?: string,
  ): Promise<GraphNeighbors> {
    // Parse optional depth — stored for forward-compatibility but not yet used.
    const parsedDepth = depth ? parseInt(depth, 10) : undefined;
    const safeDepth = parsedDepth !== undefined && Number.isFinite(parsedDepth)
      ? parsedDepth
      : undefined;

    return this.graphService.getFileNeighbors(userId, fileId, safeDepth);
  }

  // ---------------------------------------------------------------------------
  // GET /graph/path
  // ---------------------------------------------------------------------------

  /**
   * Returns the shortest path between two entities through the knowledge graph.
   *
   * Traverses `:MENTIONS` edges via shared File nodes to find how two concepts
   * are conceptually connected in the user's document corpus.
   * Returns HTTP 200 with `{ nodes: [], length: 0 }` when no path is found —
   * this is NOT an error, it means the entities are disconnected in the graph.
   *
   * @param userId - Injected from the verified JWT payload.
   * @param from   - Query param — source entity ID.
   * @param to     - Query param — target entity ID.
   * @returns GraphPath DTO with ordered nodes and hop count.
   */
  @Get('path')
  @ApiOperation({
    summary: 'Find the shortest path between two entities',
    description:
      'Uses Neo4j shortestPath to find the conceptual connection between two ' +
      'entities through the user\'s knowledge graph. ' +
      'Returns `{ nodes: [], length: 0 }` (not 404) when no path exists.',
  })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Source entity ID',
    example: 'ent-abc123',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'Target entity ID',
    example: 'ent-def456',
  })
  @ApiResponse({ status: 200, description: 'Shortest path (may be empty)', type: GraphPath })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 502, description: 'Neo4j query failed (KBGRP0001)' })
  async getPath(
    @CurrentUser('id') userId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<GraphPath> {
    return this.graphService.getPath(userId, from, to);
  }
}
