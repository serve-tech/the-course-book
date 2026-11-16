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

// Zod runs the refinement even when `url()` failed, so it must not throw on
// a value that is not a URL.
const origin = z
  .url()
  .refine(
    (value) => URL.canParse(value) && new URL(value).origin === value,
    "Use a bare origin such as https://coursebook.golf, without a path or trailing slash.",
  );

/** Comma-separated exact web origins, split and trimmed; empty parts are dropped. */
const originList = z
  .string()
  .default("")
  .transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean));

const apiSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  /** Comma-separated exact web origins for CORS and the token `azp` check. */
  WEB_ORIGINS: originList.pipe(z.array(origin)),
  /** The Clerk instance's JWT public key (PEM) for networkless verification. */
  CLERK_JWT_KEY: z.string().startsWith("-----BEGIN PUBLIC KEY-----").optional(),
  /** Public web address, used for the privacy and account-deletion links. */
  PUBLIC_WEB_URL: origin.default("https://coursebook.golf"),
  MIN_IOS_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/).default("0.0.0"),
  MIN_ANDROID_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/).default("0.0.0"),
});

/**
 * Production needs at least one web origin. Without one, CORS refuses the
 * web app and every web token fails the `azp` check, so the API would start
 * and answer 401 to every signed-in request.
 */
const productionApiSchema = apiSchema.extend({
  WEB_ORIGINS: originList.pipe(
    z.array(origin).min(1, "Set WEB_ORIGINS to the web app's origins, e.g. https://coursebook.golf; production needs at least one."),
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

/**
 * Parse API server settings from an environment-like object.
 *
 * Args:
 *     source: Variables such as `process.env`. `NODE_ENV=production` (set by
 *         the Docker image) makes `WEB_ORIGINS` required.
 *
 * Raises:
 *     ZodError: When a value is malformed, e.g. a web origin with a path, or
 *         when production has no web origin.
 */
export function parseApiEnv(source: Record<string, string | undefined>) {
  const schema = source["NODE_ENV"] === "production" ? productionApiSchema : apiSchema;
  return schema.parse(source);
}

/** API server settings: port, web origins, token key and client configuration. */
export const apiEnv = memo(() => parseApiEnv(process.env));

/** Whether course photos can be stored in the app's own bucket (#67). */
export enum PhotoStorageStatus {
  /** No photo storage variable is set: uploads are off and Commons photos stay on Commons. */
  Off = "off",
  /** Some are set but not all, or one is malformed: uploads stay off and the log names the problems. */
  Incomplete = "incomplete",
  /** Every required variable is set and valid. */
  Ready = "ready",
}

/** Where the API stores course photos: an S3-compatible bucket and the address it is served from. */
export interface PhotoStorageConfig {
  /** The S3 API endpoint, e.g. `https://<account id>.r2.cloudflarestorage.com`; the bucket goes in the path. */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** The signing region; R2 uses `auto`. */
  region: string;
  /** Where the bucket's objects are publicly served, e.g. `https://photos.coursebook.golf`, without a trailing slash. */
  publicUrl: string;
}

/** The photo storage settings, or why there are none. `problems` name variables, never their values. */
export type PhotoStorageEnv =
  | { status: PhotoStorageStatus.Off }
  | { status: PhotoStorageStatus.Incomplete; problems: string[] }
  | { status: PhotoStorageStatus.Ready; config: PhotoStorageConfig };

/** The variables that must all be set for photo storage; `PHOTO_STORAGE_REGION` is optional. */
export const PHOTO_STORAGE_VARIABLES = [
  "PHOTO_STORAGE_ENDPOINT",
  "PHOTO_STORAGE_BUCKET",
  "PHOTO_STORAGE_ACCESS_KEY_ID",
  "PHOTO_STORAGE_SECRET_ACCESS_KEY",
  "PHOTO_PUBLIC_URL",
] as const;

const isHttpUrl = (value: string) => URL.canParse(value) && /^https?:$/.test(new URL(value).protocol);
const withoutTrailingSlash = (value: string) => value.replace(/\/+$/, "");

/**
 * Read the photo storage variables. Unlike the other groups this never
 * throws: storage is optional, so a missing or malformed value turns
 * uploads off instead of stopping the API (issue #67).
 *
 * Args:
 *     source: Variables such as `process.env`. Blank values count as unset.
 *
 * Returns:
 *     Off when none of the required variables is set; Incomplete, naming
 *     each missing or malformed variable, when some are; Ready otherwise.
 */
export function parsePhotoStorageEnv(source: Record<string, string | undefined>): PhotoStorageEnv {
  const value = (name: string) => source[name]?.trim() ?? "";
  if (PHOTO_STORAGE_VARIABLES.every((name) => value(name) === "")) return { status: PhotoStorageStatus.Off };
  const problems = PHOTO_STORAGE_VARIABLES.filter((name) => value(name) === "").map((name) => name + " is not set");
  for (const name of ["PHOTO_STORAGE_ENDPOINT", "PHOTO_PUBLIC_URL"] as const)
    if (value(name) !== "" && !isHttpUrl(value(name))) problems.push(name + " is not an http(s) URL");
  if (/[^a-z0-9.-]/.test(value("PHOTO_STORAGE_BUCKET")))
    problems.push("PHOTO_STORAGE_BUCKET is not a bucket name (lowercase letters, digits, dots and hyphens)");
  if (problems.length) return { status: PhotoStorageStatus.Incomplete, problems };
  return {
    status: PhotoStorageStatus.Ready,
    config: {
      endpoint: withoutTrailingSlash(value("PHOTO_STORAGE_ENDPOINT")),
      bucket: value("PHOTO_STORAGE_BUCKET"),
      accessKeyId: value("PHOTO_STORAGE_ACCESS_KEY_ID"),
      secretAccessKey: value("PHOTO_STORAGE_SECRET_ACCESS_KEY"),
      region: value("PHOTO_STORAGE_REGION") || "auto",
      publicUrl: withoutTrailingSlash(value("PHOTO_PUBLIC_URL")),
    },
  };
}

/** Photo storage settings, for uploads and stored copies of Commons photos. */
export const photoStorageEnv = memo(() => parsePhotoStorageEnv(process.env));
