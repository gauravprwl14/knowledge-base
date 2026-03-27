/**
 * @file graph.module.ts
 * @description NestJS feature module for the Knowledge Graph REST API.
 *
 * Wires together:
 * - `Neo4jService` — manages the neo4j-driver lifecycle and provides `runQuery`
 * - `GraphService` — business logic; translates Cypher results to DTOs
 * - `GraphController` — REST endpoints under the `/graph` prefix
 *
 * Imports `AuthModule` to make `JwtAuthGuard` available inside the module.
 * Even though `JwtAuthGuard` is registered globally in `app.module.ts`, the
 * explicit import here:
 * 1. Makes the dependency visible when reading the module in isolation.
 * 2. Ensures the module works correctly if moved to a standalone microservice.
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * import { GraphModule } from './modules/graph/graph.module';
 *
 * @Module({ imports: [GraphModule] })
 * export class AppModule {}
 * ```
 */

import { Module } from '@nestjs/common';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';
import { Neo4jService } from './neo4j.service';
import { AuthModule } from '../auth/auth.module';

/**
 * GraphModule — feature module for Neo4j-backed knowledge graph endpoints.
 *
 * Exposed at: `GET /graph/entities`, `GET /graph/entity/:id/related`,
 * `GET /graph/file/:fileId/neighbors`, `GET /graph/path`.
 *
 * All routes require a valid JWT token (enforced by `JwtAuthGuard`).
 */
@Module({
  imports: [
    // AuthModule exports JwtAuthGuard, JwtModule, and PassportModule.
    // Required here to satisfy the guard dependency in GraphController.
    AuthModule,
  ],
  controllers: [GraphController],
  providers: [
    GraphService,
    Neo4jService,
  ],
  // Export Neo4jService in case another module (e.g. AdminModule) needs
  // to run raw graph queries in the future.
  exports: [Neo4jService, GraphService],
})
export class GraphModule {}
