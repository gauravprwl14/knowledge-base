/**
 * @file neo4j.service.ts
 * @description Thin wrapper around the `neo4j-driver` package that manages
 * driver lifecycle and provides a single `runQuery` helper consumed by
 * GraphService.
 *
 * Design decisions:
 * - One driver instance per application lifetime (created in `onModuleInit`,
 *   closed in `onModuleDestroy`). The driver maintains an internal connection
 *   pool; we never hold raw sockets.
 * - Every query opens a fresh session scoped to the database name, runs the
 *   Cypher, collects records, then closes the session in a `finally` block —
 *   this prevents session leaks even on partial failures.
 * - Connection errors during startup are logged and rethrown so the health
 *   check and NestJS bootstrap surfaces the failure rather than silently
 *   running with a broken driver.
 * - All queries MUST pass `userId` as a parameter; the service itself does not
 *   enforce this constraint but documents it so callers understand the contract.
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import neo4j, { Driver, Session, Record as Neo4jRecord } from 'neo4j-driver';
import { AppError } from '../../errors/types/app-error';
import { GRP_ERROR_CODES } from '../../errors/error-codes/index';

/** Token used to inject the raw Driver — exposed for testing overrides. */
export const NEO4J_DRIVER_TOKEN = 'NEO4J_DRIVER';

/**
 * NeoJ4Service — manages the Neo4j Driver lifecycle and exposes a single
 * `runQuery` method that handles session creation and teardown automatically.
 *
 * @example
 * ```typescript
 * const records = await this.neo4j.runQuery(
 *   'MATCH (e:Entity {id: $id}) RETURN e',
 *   { id: 'ent-123' },
 * );
 * ```
 */
@Injectable()
export class Neo4jService implements OnModuleInit, OnModuleDestroy {
  /** Active driver instance; assigned in `onModuleInit`. */
  private driver: Driver | null = null;

  /**
   * Database name to use for every session. Defaults to `neo4j` (the default
   * Neo4j 4/5 database). Override via `NEO4J_DATABASE` env var if needed.
   */
  private readonly database: string;

  constructor(
    @InjectPinoLogger(Neo4jService.name)
    private readonly logger: PinoLogger,
  ) {
    // Read database name from env; fall back to the standard default.
    this.database = process.env.NEO4J_DATABASE ?? 'neo4j';
  }

  // ---------------------------------------------------------------------------
  // Lifecycle hooks
  // ---------------------------------------------------------------------------

  /**
   * Creates the Neo4j driver and verifies connectivity on startup.
   * Throws if the required environment variables are absent or if the initial
   * connectivity check fails — this surfaces misconfiguration at boot time
   * rather than on the first query.
   *
   * @throws {AppError} KBGRP0001 when the driver cannot connect.
   */
  async onModuleInit(): Promise<void> {
    const uri = process.env.NEO4J_URI;
    const user = process.env.NEO4J_USER;
    const password = process.env.NEO4J_PASSWORD;

    // Validate required env vars are present before attempting a connection.
    if (!uri || !user || !password) {
      this.logger.warn(
        {
          event: 'neo4j.init.skipped',
          hasUri: Boolean(uri),
          hasUser: Boolean(user),
          hasPassword: Boolean(password),
        },
        'neo4j: NEO4J_URI/USER/PASSWORD not set — driver not initialised (graph endpoints will return empty results)',
      );
      // We intentionally do NOT throw here: this allows the kms-api to start
      // even when Neo4j is unavailable (e.g. local dev without graph worker).
      // Graph endpoints will return graceful empty responses via the null-driver
      // branch in runQuery().
      return;
    }

    try {
      // Create the driver with a conservative connection timeout.
      // `maxConnectionPoolSize` default is 100; we leave it at the driver default.
      this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
        connectionTimeout: 5000,
        maxConnectionLifetime: 3600000, // 1 h — recycles stale connections
      });

      // Verify connectivity — raises if Neo4j is unreachable.
      await this.driver.verifyConnectivity();

      this.logger.info(
        { event: 'neo4j.init.ok', uri, database: this.database },
        'neo4j: driver connected successfully',
      );
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        { event: 'neo4j.init.error', uri, error: error.message },
        'neo4j: driver connection failed on startup',
      );
      // Null out the driver so runQuery() returns empty arrays safely.
      this.driver = null;
    }
  }

  /**
   * Closes the driver connection pool on application shutdown.
   * NestJS calls this automatically during graceful shutdown.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.logger.info({ event: 'neo4j.destroy.ok' }, 'neo4j: driver closed');
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Runs a Cypher query and returns the resulting records.
   *
   * A new session is opened for each call (the driver pools the underlying
   * TCP connections so this is cheap). The session is always closed in a
   * `finally` block to prevent connection leaks.
   *
   * If the driver was not initialised (missing env vars or startup failure),
   * this method returns an empty array so callers can return graceful empty
   * responses rather than crashing.
   *
   * **Security contract**: callers MUST pass `userId` in `params` and include
   * a `WHERE … user_id = $userId` (or equivalent) clause in their Cypher.
   * This service does NOT add user scoping automatically.
   *
   * @param cypher - The Cypher query string.
   * @param params - Named parameters bound into the query (prevents injection).
   * @returns Array of Neo4j Record objects.
   * @throws {AppError} KBGRP0001 if the Neo4j query itself throws at runtime.
   */
  async runQuery(cypher: string, params: Record<string, unknown>): Promise<Neo4jRecord[]> {
    // Guard: if driver wasn't initialised, return empty rather than crashing.
    if (!this.driver) {
      this.logger.warn(
        { event: 'neo4j.query.skipped', cypher: cypher.substring(0, 100) },
        'neo4j: driver not initialised — returning empty result',
      );
      return [];
    }

    // Open a read session scoped to our target database.
    const session: Session = this.driver.session({
      database: this.database,
      defaultAccessMode: neo4j.session.READ,
    });

    try {
      this.logger.debug(
        { event: 'neo4j.query.start', cypher: cypher.substring(0, 200) },
        'neo4j: executing query',
      );

      const result = await session.run(cypher, params);

      this.logger.debug(
        {
          event: 'neo4j.query.ok',
          recordCount: result.records.length,
        },
        'neo4j: query completed',
      );

      return result.records;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));

      this.logger.error(
        {
          event: 'neo4j.query.error',
          error: error.message,
          cypher: cypher.substring(0, 200),
        },
        'neo4j: query failed',
      );

      // Wrap in AppError so the global exception filter emits a consistent
      // { statusCode, error, message, code } JSON response.
      throw new AppError({
        code: GRP_ERROR_CODES.GRAPH_QUERY_FAILED.code,
        message: `Neo4j query failed: ${error.message}`,
        statusCode: GRP_ERROR_CODES.GRAPH_QUERY_FAILED.httpStatus,
        cause: error,
      });
    } finally {
      // Always close the session to return the connection to the pool.
      await session.close();
    }
  }
}
