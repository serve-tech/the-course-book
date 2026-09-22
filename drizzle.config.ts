import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside the app, so load the local .env when present.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./app/db/schema.ts",
  out: "./app/db/migrations",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: { url: process.env["DATABASE_URL"] ?? "" },
});
