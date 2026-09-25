import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs from apps/api (pnpm --filter), so load the repository's
// .env by path when present.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: { url: process.env["DATABASE_URL"] ?? "" },
});
