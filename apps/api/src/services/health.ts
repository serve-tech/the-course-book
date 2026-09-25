import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

/**
 * Round-trip to the database for health probes.
 *
 * Raises:
 *     Error: The driver's error when the database is unreachable, so the
 *         probe can report 503 and a broken connection string never passes
 *         a deploy.
 */
export async function checkDatabase(db: Database): Promise<void> {
  await db.execute(sql`select 1`);
}
