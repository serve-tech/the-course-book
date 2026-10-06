import pg from "pg";

/** Postgres SQLSTATE `unique_violation`. */
const UNIQUE_VIOLATION = "23505";

/** Causes deeper than this are not searched, which also ends a cyclic chain. */
const MAX_DEPTH = 8;

/**
 * Whether a failure is a unique violation of one constraint or index.
 *
 * Drizzle wraps the driver's error in a `DrizzleQueryError` (and services
 * may wrap that again), so the `cause` chain is searched for the Postgres
 * error.
 *
 * Args:
 *     error: Anything thrown by a query.
 *     constraint: The constraint or unique index name, e.g.
 *         `USERNAME_UNIQUE_INDEX`.
 *
 * Returns:
 *     True when a `pg.DatabaseError` in the chain has SQLSTATE 23505 and
 *     names `constraint`.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current = error;
  for (let depth = 0; current instanceof Error && depth <= MAX_DEPTH; depth += 1) {
    if (current instanceof pg.DatabaseError && current.code === UNIQUE_VIOLATION && current.constraint === constraint) return true;
    current = current.cause;
  }
  return false;
}
