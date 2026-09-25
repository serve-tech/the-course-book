import { runMigrations } from "./migrate.ts";

/**
 * Command-line migration: `pnpm db:migrate` (DATABASE_URL from the
 * environment or the repository's .env).
 *
 * A separate file from migrate.ts on purpose: an "am I the entry point"
 * check inside migrate.ts also fires once the module is bundled into the API
 * entry, which would migrate twice on every start.
 */
const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
await runMigrations(url);
console.log("Migrations applied");
