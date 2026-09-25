import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import pg from "pg";

/**
 * Apply committed migrations to the database named by DATABASE_URL.
 *
 * Runs as `node src/db/migrate.ts` from apps/api (Node's built-in type
 * stripping), so this file must stay free of TypeScript-only runtime syntax
 * such as enums and must not import the schema. The test harnesses and local
 * setup call `runMigrations` directly.
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
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  await runMigrations(url);
  console.log("Migrations applied");
}
