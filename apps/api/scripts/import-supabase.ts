/**
 * Import member data from the retired Supabase project into Postgres.
 *
 * Inputs are the CSV exports (with header rows) in IMPORT_DIR (default
 * `.import/` at the repository root, gitignored): auth_users.csv,
 * profiles.csv, courses.csv, user_courses.csv and rounds.csv, produced by the
 * single-snapshot export in docs/cutover.md step 3.1. auth_users.csv holds
 * password hashes: never commit, print or share it, and delete `.import/`
 * after the import.
 *
 * Steps (apps/api/scripts/import/):
 * 1. rows.ts validates every row; any invalid row stops the import.
 * 2. plan.ts accounts for every row (imported, already in the catalog,
 *    merged into an equivalent entry, moved with it, or a problem); any
 *    problem stops the import before it writes.
 * 3. run.ts finds or creates each member's Clerk account (keeping bcrypt
 *    passwords), writes courses, users, lists and rounds, and verifies the
 *    database against the plan.
 *
 * Exit status is 0 only when nothing stopped the import and, for a real run,
 * the database matches the plan.
 *
 * Env: DATABASE_URL, CLERK_SECRET_KEY, IMPORT_DIR. Flags: --dry-run (plan,
 * look accounts up, report; write nothing).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClerkClient } from "@clerk/backend";
import { createDatabase } from "../src/db/client";
import { parseCSV } from "../src/domain/opengolf";
import { parseExport, type ExportFiles } from "./import/rows";
import { clerkImportAccounts, runImport } from "./import/run";

const dryRun = process.argv.includes("--dry-run");
// Exports stay outside the committed tree: the default is the gitignored
// .import/ at the repository root, whatever the working directory.
const importDir = process.env["IMPORT_DIR"] ?? fileURLToPath(new URL("../../../.import", import.meta.url));
const databaseUrl = process.env["DATABASE_URL"];
const clerkSecretKey = process.env["CLERK_SECRET_KEY"];
if (!databaseUrl || !clerkSecretKey) {
  console.error("DATABASE_URL and CLERK_SECRET_KEY are required");
  process.exit(1);
}

const read = (name: keyof ExportFiles) => parseCSV(readFileSync(join(importDir, name), "utf8"));
const files: ExportFiles = {
  "auth_users.csv": read("auth_users.csv"),
  "profiles.csv": read("profiles.csv"),
  "courses.csv": read("courses.csv"),
  "user_courses.csv": read("user_courses.csv"),
  "rounds.csv": read("rounds.csv"),
};
const { data, problems } = parseExport(files);
console.log(
  `read ${String(data.authUsers.length)} auth users, ${String(data.profiles.length)} profiles, ${String(data.courses.length)} courses, ${String(data.memberships.length)} list entries, ${String(data.rounds.length)} rounds from ${importDir}`,
);
if (problems.length) {
  console.error(`\n${String(problems.length)} invalid rows; nothing was written:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const { db, pool } = createDatabase(databaseUrl);
try {
  const result = await runImport(
    { db, accounts: clerkImportAccounts(createClerkClient({ secretKey: clerkSecretKey }).users), log: (line) => { console.log(line); } },
    data,
    { dryRun },
  );
  process.exitCode = result.ok ? 0 : 1;
} finally {
  await pool.end();
}
