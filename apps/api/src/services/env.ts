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

const origin = z
  .url()
  .refine((value) => new URL(value).origin === value, "Use a bare origin such as https://coursebook.golf, without a path or trailing slash.");

const apiSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  /** Comma-separated exact web origins for CORS and the token `azp` check. */
  WEB_ORIGINS: z
    .string()
    .default("")
    .transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean))
    .pipe(z.array(origin)),
  /** The Clerk instance's JWT public key (PEM) for networkless verification. */
  CLERK_JWT_KEY: z.string().startsWith("-----BEGIN PUBLIC KEY-----").optional(),
  /** Public web address, used for the privacy and account-deletion links. */
  PUBLIC_WEB_URL: origin.default("https://coursebook.golf"),
  MIN_IOS_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/).default("0.0.0"),
  MIN_ANDROID_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/).default("0.0.0"),
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

/**
 * Parse API server settings from an environment-like object.
 *
 * Raises:
 *     ZodError: When a value is malformed, e.g. a web origin with a path.
 */
export function parseApiEnv(source: Record<string, string | undefined>) {
  return apiSchema.parse(source);
}

/** API server settings: port, web origins, token key and client configuration. */
export const apiEnv = memo(() => parseApiEnv(process.env));
