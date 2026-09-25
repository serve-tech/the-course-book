import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * Validated process environment, grouped so a module only requires the
 * variables it uses. Each group is parsed once on first access.
 *
 * Locally the repository's `.env` is loaded when present, found by path so it
 * works from any working directory. In production Render supplies the
 * variables; nothing is read from disk.
 */
const localEnv = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (process.env["NODE_ENV"] !== "production" && existsSync(localEnv)) {
  process.loadEnvFile(localEnv);
}

const databaseSchema = z.object({
  DATABASE_URL: z.url(),
});

const clerkSchema = z.object({
  CLERK_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
  CLERK_SECRET_KEY: z.string().startsWith("sk_"),
});

const searchSchema = z.object({
  OPENGOLF_API_URL: z
    .url()
    .default("https://api.opengolfapi.org/v1/courses/search"),
  OPENGOLF_CSV_URL: z
    .url()
    .default(
      "https://raw.githubusercontent.com/opengolfapi/data/main/opengolfapi-us.csv",
    ),
});

function memo<T>(parse: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= parse());
}

/** Database connection settings. Throws a readable error when missing. */
export const databaseEnv = memo(() => databaseSchema.parse(process.env));

/** Clerk instance keys. The publishable key is safe to send to the browser. */
export const clerkEnv = memo(() => clerkSchema.parse(process.env));

/** External course discovery endpoints. */
export const searchEnv = memo(() => searchSchema.parse(process.env));
