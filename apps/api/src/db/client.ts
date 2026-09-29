import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

/**
 * Create a Drizzle database handle over a pg connection pool.
 *
 * Server modules receive a `Database` as an argument so tests can pass a
 * handle bound to the test database. `app/server/db.server.ts` owns the
 * process-wide instance for routes.
 *
 * Args:
 *     connectionString: Postgres URL. Append `?sslmode=require` for hosts
 *         that need TLS; pg parses it from the URL.
 */
export function createDatabase(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  return { db: drizzle(pool, { schema, casing: "snake_case" }), pool };
}

export type Database = ReturnType<typeof createDatabase>["db"];

/** The handle available inside `db.transaction(async (tx) => ...)`. */
export type Transaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

/** Either a database or an open transaction; query builders accept both. */
export type Executor = Database | Transaction;
