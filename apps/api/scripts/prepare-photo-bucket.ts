/**
 * Create the local photo bucket on the storage emulator and make its
 * objects public, for photo uploads in local development without
 * Cloudflare (issue #67).
 *
 * Usage: pnpm photos:local-bucket
 *
 * Reads the PHOTO_STORAGE_* variables from the shell or `.env`. Refuses an
 * endpoint that isn't on this machine: R2 buckets are created in
 * Cloudflare's dashboard, never by this script.
 */
import { photoStorageEnv, PhotoStorageStatus } from "../src/services/env";
import { prepareLocalBucket } from "./photos/local-bucket";

const env = photoStorageEnv();
if (env.status !== PhotoStorageStatus.Ready) {
  console.error(
    env.status === PhotoStorageStatus.Off
      ? "Set the PHOTO_STORAGE_* variables and PHOTO_PUBLIC_URL first; .env.example has the local values."
      : "Photo storage is only partly configured: " + env.problems.join("; "),
  );
  process.exit(1);
}
try {
  await prepareLocalBucket(env.config);
  console.log(`Bucket ${env.config.bucket} is ready at ${env.config.endpoint}; photos are served from ${env.config.publicUrl}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
