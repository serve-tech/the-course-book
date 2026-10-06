import pg from "pg";
import { causeChain } from "../services/errors";

/** Postgres SQLSTATE `unique_violation`. */
const UNIQUE_VIOLATION = "23505";

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
  return causeChain(error).some(
    (link) => link instanceof pg.DatabaseError && link.code === UNIQUE_VIOLATION && link.constraint === constraint,
  );
}
