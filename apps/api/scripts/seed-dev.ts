/**
 * Fill the local database with friends, lists, rounds and feed activity to
 * develop against.
 *
 * Usage: pnpm seed:dev [--me <username or email>] [--replace-mine | --keep-mine]
 *
 * Creates the members in scripts/seed/personas.ts (ids `seed_*`; they have no
 * Clerk accounts, so nobody signs in as them), their lists and rounds, and
 * their friendships and requests with you. You are an existing local member,
 * named by `--me` or SEED_ME in `.env`; signing in to the local app once
 * creates your row. Rerunning replaces the previous seed and moves its dates
 * to today. Your own list is seeded only while it is empty, unless
 * `--replace-mine` (replace it) or `--keep-mine` (leave it alone).
 *
 * Writes only to a database on this machine (seed/local.ts); DATABASE_URL
 * comes from the shell or `.env`.
 */
import { parseArgs } from "node:util";
import { createDatabase } from "../src/db/client";
import { allCourses } from "../src/services/catalog";
import { databaseEnv } from "../src/services/env";
import { isLocalDatabaseUrl } from "./seed/local";
import { planSeed, summarizePlan } from "./seed/plan";
import { findMember, writeSeed, YourData } from "./seed/run";

const USAGE = "Usage: pnpm seed:dev [--me <username or email>] [--replace-mine | --keep-mine]";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let options: { me?: string | undefined; "replace-mine": boolean; "keep-mine": boolean };
try {
  ({ values: options } = parseArgs({
    options: {
      me: { type: "string" },
      "replace-mine": { type: "boolean", default: false },
      "keep-mine": { type: "boolean", default: false },
    },
  }));
} catch (error) {
  fail(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
}
if (options["replace-mine"] && options["keep-mine"]) fail(`Choose one of --replace-mine and --keep-mine.\n${USAGE}`);
const yours = options["replace-mine"] ? YourData.Replace : options["keep-mine"] ? YourData.Keep : YourData.FillIfEmpty;

const { DATABASE_URL } = databaseEnv();
if (!isLocalDatabaseUrl(DATABASE_URL)) fail("DATABASE_URL is not a database on this machine; the seed only writes to local databases.");
const reference = options.me ?? process.env["SEED_ME"];
if (!reference) fail(`Name yourself with --me <username or email> or SEED_ME in .env.\n${USAGE}`);

const { db, pool } = createDatabase(DATABASE_URL);
try {
  const you = await findMember(db, reference);
  if (!you) throw new Error(`No local member "${reference}". Start the app (pnpm dev), sign in once so your account is created, then rerun.`);
  const plan = planSeed({ catalog: await allCourses(db), youId: you.id, now: new Date(), includeYou: yours !== YourData.Keep });
  await writeSeed(db, plan, you.id, yours);
  const summary = summarizePlan(plan, you.id);
  const others = summary.members - summary.friends - summary.requestsToYou - summary.requestsFromYou;
  console.log(
    `Seeded ${String(summary.members)} members around ${you.username}: ${String(summary.friends)} friends, ` +
      `${String(summary.requestsToYou)} friend request to you, ${String(summary.requestsFromYou)} from you, ${String(others)} to find in search.`,
  );
  console.log(`  Their lists: ${String(summary.theirCourses)} courses, ${String(summary.theirRounds)} rounds.`);
  console.log(
    yours === YourData.Keep
      ? "  Your list and rounds: unchanged."
      : `  Your list: ${String(summary.yourCourses)} courses, ${String(summary.yourRounds)} rounds.`,
  );
  console.log(`Run pnpm dev, sign in as ${you.username} and open Home.`);
} catch (error) {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
  // Drizzle wraps driver errors; the cause says which constraint or connection failed.
  if (error instanceof Error && error.cause) console.error(error.cause);
} finally {
  await pool.end();
}
