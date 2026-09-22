import { sql } from "drizzle-orm";
import { createDatabase, type Database } from "../db/client";

/** Connection string for the migrated test database. */
export const TEST_DATABASE_URL =
  process.env["DATABASE_URL_TEST"] ??
  "postgres://coursebook:coursebook@localhost:5433/coursebook_test";

/** A fresh handle bound to the test database. Call `pool.end()` in afterAll. */
export function testDatabase() {
  return createDatabase(TEST_DATABASE_URL);
}

/**
 * Remove all member data while keeping the seeded catalog. Custom courses
 * created during a test are removed too.
 *
 * Note:
 *     Never TRUNCATE ... CASCADE here: courses.created_by references users,
 *     so a cascade would wipe the seeded catalog.
 */
export async function resetMemberData(db: Database): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE rounds, user_courses`);
  await db.execute(sql`DELETE FROM courses WHERE is_custom`);
  await db.execute(sql`DELETE FROM users`);
}

/** Walk an error's cause chain and join the messages for assertions. */
export function errorChain(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join(" <- ");
}

/**
 * Assert that a database operation fails with a message (usually a constraint
 * name) somewhere in its cause chain. Drizzle wraps the driver error, so the
 * top-level message alone only says "Failed query".
 */
export async function expectDbError(
  operation: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    const chain = errorChain(error);
    if (!pattern.test(chain))
      throw new Error(`Expected ${pattern} in database error, got: ${chain}`, {
        cause: error,
      });
    return;
  }
  throw new Error(`Expected database error matching ${pattern}`);
}
