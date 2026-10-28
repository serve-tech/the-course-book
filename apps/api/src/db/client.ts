import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

/**
 * Limits for the API server's request pool. The names are pg's pool options
 * (`statement_timeout` is passed to Postgres as is), because the object is
 * spread into `pg.Pool`'s config.
 */
export interface PoolTimeouts {
  /** How long to wait for a connection, new or freed from a full pool, in milliseconds. */
  connectionTimeoutMillis: number;
  /** Postgres `statement_timeout` for every connection of the pool, in milliseconds. */
  statement_timeout: number;
}

/**
 * Timeouts for the requests the API serves.
 *
 * - Connection, 5 s: inside Render's network a connection opens in
 *   milliseconds, so a 5-second wait means the database is down or all ten
 *   connections are stuck. Failing then answers the member with an error
 *   instead of holding the request until the client gives up.
 * - Statement, 10 s: request statements (the catalog snapshot, a list
 *   renumber, account deletion) take milliseconds, so this leaves two orders
 *   of magnitude for a slow free-plan instance. A statement past it is stuck,
 *   usually waiting for a lock, while holding a pool connection and possibly
 *   a member's advisory lock; waiting for `pg_advisory_xact_lock` counts.
 *
 * Only `main.ts` passes these. Migrations open their own pool
 * (`runMigrations`), and the importer, the seed script and tests call
 * `createDatabase` without them, because their statements may rightly run
 * longer.
 */
export const REQUEST_POOL_TIMEOUTS: PoolTimeouts = {
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
};

/**
 * Create a Drizzle database handle over a pg connection pool.
 *
 * Server modules receive a `Database` as an argument so tests can pass a
 * handle bound to the test database. `main.ts` owns the API process's
 * instance.
 *
 * Args:
 *     connectionString: Postgres URL. Append `?sslmode=require` for hosts
 *         that need TLS; pg parses it from the URL.
 *     timeouts: Connection and statement limits; the API server passes
 *         `REQUEST_POOL_TIMEOUTS`. Without them nothing times out.
 */
export function createDatabase(connectionString: string, timeouts?: PoolTimeouts) {
  const pool = new pg.Pool({ connectionString, max: 10, ...timeouts });
  return { db: drizzle(pool, { schema, casing: "snake_case" }), pool };
}

export type Database = ReturnType<typeof createDatabase>["db"];

/** The handle available inside `db.transaction(async (tx) => ...)`. */
export type Transaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

/** Either a database or an open transaction; query builders accept both. */
export type Executor = Database | Transaction;
