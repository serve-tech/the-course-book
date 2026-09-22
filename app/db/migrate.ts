import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/**
 * Apply committed migrations to the database named by DATABASE_URL.
 *
 * Runs as `node app/db/migrate.ts` (Node's built-in type stripping), so this
 * file must stay free of TypeScript-only runtime syntax such as enums and must
 * not import the schema. Render executes it as the pre-deploy command; the
 * test harness and local setup call `runMigrations` directly.
 */
export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "app/db/migrations" });
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
