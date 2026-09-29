/**
 * Preflight for the member import: the database's schema must be exactly the
 * one this checkout knows.
 *
 * The importer writes tables that only exist once the API has started and
 * migrated (it does not migrate itself), and an older checkout would skip
 * writes the deployed schema expects (friendships, since #11). Comparing the
 * applied migrations with this checkout's drizzle journal catches both: run
 * the import from the deployed `main`, after its deploy is live.
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import type { Database } from "../../src/db/client";

/**
 * Why the database does not match this checkout's migrations; null when it does.
 *
 * Migrations are identified by drizzle's journal timestamp (`when`), which
 * the migrator stores as `created_at`.
 *
 * Args:
 *     known: Timestamps of the migrations in this checkout's journal.
 *     applied: Timestamps recorded in the database.
 */
export function schemaMismatch(known: readonly number[], applied: readonly number[]): string | null {
  const done = new Set(applied);
  const ours = new Set(known);
  const missing = known.filter((when) => !done.has(when)).length;
  const unknown = applied.filter((when) => !ours.has(when)).length;
  if (missing)
    return `the database lacks ${String(missing)} migration(s) this checkout has; deploy the API first (it migrates on start)`;
  if (unknown)
    return `the database has ${String(unknown)} migration(s) this checkout lacks; run the import from the deployed main`;
  return null;
}

/** Timestamps of the migrations in this checkout's drizzle journal. */
export function journalMigrations(): number[] {
  const url = new URL("../../src/db/migrations/meta/_journal.json", import.meta.url);
  const journal = JSON.parse(readFileSync(url, "utf8")) as { entries: { when: number }[] };
  return journal.entries.map((entry) => entry.when);
}

/** Timestamps of the migrations the database has applied (the query fails on a never-migrated database). */
export async function appliedMigrations(db: Database): Promise<number[]> {
  const { rows } = await db.execute<{ created_at: string | null }>(
    sql`select created_at from drizzle.__drizzle_migrations`,
  );
  return rows.map((row) => Number(row.created_at));
}
