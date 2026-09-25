import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import pg from "pg";

/**
 * Session advisory lock key held while migrating. Arbitrary but fixed; it
 * shares the int8 key space with nothing else in this schema.
 */
const MIGRATION_LOCK = 725_202_609;

/**
 * Apply committed migrations to the database named by DATABASE_URL.
 *
 * The API runs this on every start (free Render plans have no pre-deploy
 * step), and during a deploy the new instance starts while the old one still
 * serves. A session advisory lock makes concurrent starts migrate one at a
 * time; the second finds nothing left to apply.
 *
 * `migrate-cli.ts` runs it from the command line with Node's built-in type
 * stripping, so this file must stay free of TypeScript-only runtime syntax
 * such as enums and must not import the schema. The API entry, the test
 * harnesses and local setup call `runMigrations` directly.
 *
 * Args:
 *     connectionString: Postgres URL.
 *     migrationsFolder: Folder of committed migrations. Defaults to the one
 *         beside this file, independent of the working directory.
 */
export async function runMigrations(
  connectionString: string,
  migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url)),
): Promise<void> {
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
      await migrate(drizzle(client), { migrationsFolder });
    } finally {
      await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => undefined);
      client.release();
    }
  } finally {
    await pool.end();
  }
}
