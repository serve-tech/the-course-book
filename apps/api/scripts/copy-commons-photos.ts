/**
 * Copy course photos picked from Wikimedia Commons before photo storage
 * existed into it, and point their rows at the copies (issue #67). Credit,
 * license, source page and Commons file name stay as they are.
 *
 * Usage: pnpm photos:copy-commons [--apply] [--remote]
 *
 * Without --apply it only lists what it would copy. DATABASE_URL and the
 * PHOTO_STORAGE_* variables come from the shell or `.env`. A database that
 * is not on this machine is refused unless --remote is given, so production
 * is only changed on purpose. Safe to run again: photos already copied are
 * skipped.
 */
import { parseArgs } from "node:util";
import { createDatabase } from "../src/db/client";
import { UPLOAD_LIMITS } from "../src/domain/stored-photo";
import { createCommonsClient } from "../src/services/commons";
import { databaseEnv, photoStorageEnv, PhotoStorageStatus } from "../src/services/env";
import { loadImageProcessor } from "../src/services/photo-images";
import { createS3PhotoStore } from "../src/services/photo-store";
import { copyCommonsPhotos, CopyResult, photosToCopy } from "./photos/copy-commons";
import { isLocalDatabaseUrl } from "./seed/local";

const USAGE = "Usage: pnpm photos:copy-commons [--apply] [--remote]";
/** One Commons download a second at most. */
const PAUSE_MS = 1_000;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let parsed: { values: { apply: boolean; remote: boolean }; positionals: string[] };
try {
  parsed = parseArgs({ options: { apply: { type: "boolean", default: false }, remote: { type: "boolean", default: false } }, allowPositionals: true });
} catch (error) {
  fail(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
}
if (parsed.positionals.length) fail(USAGE);

const { DATABASE_URL } = databaseEnv();
const host = new URL(DATABASE_URL).host;
if (!isLocalDatabaseUrl(DATABASE_URL) && !parsed.values.remote) fail(`DATABASE_URL points at ${host}, not this machine. Add --remote to change it.`);
const storage = photoStorageEnv();
if (storage.status !== PhotoStorageStatus.Ready)
  fail(storage.status === PhotoStorageStatus.Off ? "Photo storage isn't configured: set the PHOTO_STORAGE_* variables and PHOTO_PUBLIC_URL." : "Photo storage is only partly configured: " + storage.problems.join("; "));
const { config } = storage;

const { db, pool } = createDatabase(DATABASE_URL);
try {
  if (!parsed.values.apply) {
    const photos = await photosToCopy(db);
    console.log(`${String(photos.length)} Commons ${photos.length === 1 ? "photo" : "photos"} on ${host} would be copied into ${config.bucket} and served from ${config.publicUrl}:`);
    for (const photo of photos) console.log(`  ${photo.courseName}: ${photo.commonsFile ?? photo.url}`);
    console.log("Nothing was changed. Add --apply to copy them.");
  } else {
    const deps = {
      commons: createCommonsClient(),
      storage: { store: createS3PhotoStore(config), images: await loadImageProcessor(UPLOAD_LIMITS), limits: UPLOAD_LIMITS },
      log: (message: string, detail: { keys: string[] }, error?: unknown) => {
        console.error(`${message}: ${detail.keys.join(", ")}${error instanceof Error ? ` (${error.message})` : ""}`);
      },
    };
    const outcomes = await copyCommonsPhotos(db, deps, {
      pauseMs: PAUSE_MS,
      onOutcome: ({ photo, result, reason }) => {
        console.log(`  ${result}: ${photo.courseName}${reason ? ` (${reason})` : ""}`);
      },
    });
    const count = (result: CopyResult) => outcomes.filter((outcome) => outcome.result === result).length;
    console.log(
      `${host}: ${String(count(CopyResult.Copied))} copied, ${String(count(CopyResult.Changed))} changed during the run and left as they are, ${String(count(CopyResult.Failed))} failed.`,
    );
    console.log("The API shows the copies once its course cache refreshes, within 10 minutes.");
    if (count(CopyResult.Failed)) process.exitCode = 1;
  }
} finally {
  await pool.end();
}
