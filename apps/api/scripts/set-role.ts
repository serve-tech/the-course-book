/**
 * Give a member a role: member, curator or admin (decision 2026-11-13).
 * The API lets admins make curators; this is the only way to make an admin.
 *
 * Usage: pnpm role:set <username> <member|curator|admin> [--remote]
 *
 * DATABASE_URL comes from the shell or `.env`. A database that is not on
 * this machine is refused unless `--remote` is given, so production is only
 * changed on purpose.
 */
import { parseArgs } from "node:util";
import { createDatabase } from "../src/db/client";
import { databaseEnv } from "../src/services/env";
import { assignRole, parseRole } from "./role/assign";
import { isLocalDatabaseUrl } from "./seed/local";

const USAGE = "Usage: pnpm role:set <username> <member|curator|admin> [--remote]";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let parsed: { values: { remote: boolean }; positionals: string[] };
try {
  parsed = parseArgs({ options: { remote: { type: "boolean", default: false } }, allowPositionals: true });
} catch (error) {
  fail(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
}
const [username, roleName, ...extra] = parsed.positionals;
const role = parseRole(roleName);
if (!username || !role || extra.length) fail(USAGE);

const { DATABASE_URL } = databaseEnv();
const host = new URL(DATABASE_URL).host;
if (!isLocalDatabaseUrl(DATABASE_URL) && !parsed.values.remote) fail(`DATABASE_URL points at ${host}, not this machine. Add --remote to change it.`);

const { db, pool } = createDatabase(DATABASE_URL);
try {
  const change = await assignRole(db, username, role);
  if (!change) fail(`No active member is called ${username} on ${host}.`);
  console.log(`${change.username}: ${change.from} → ${change.to} (${host})`);
} finally {
  await pool.end();
}
