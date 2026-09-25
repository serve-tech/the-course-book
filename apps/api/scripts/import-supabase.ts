/**
 * Import member data from the retired Supabase project into Postgres.
 *
 * Inputs are CSV exports (with header rows) in IMPORT_DIR (default .import/ at the repository
 * root, gitignored): profiles.csv, courses.csv, user_courses.csv, rounds.csv.
 * The maintainer produces them with `\copy <table> to '<file>' csv header`
 * against the Supabase database; the repository never holds them.
 *
 * Steps:
 * 1. Courses missing from the catalog (custom ones) are inserted with their
 *    original ids.
 * 2. Each profile is matched to a Clerk user by email, or created in Clerk
 *    without a password so the member signs in with Google or a reset. The
 *    users row records legacy_supabase_id.
 * 3. Memberships are re-ordered and de-duplicated by apps/api/scripts/import/plan.ts;
 *    rounds are re-pointed and inserted; courses that only had rounds get a
 *    membership at the bottom.
 * 4. Counts are printed for verification.
 *
 * Env: DATABASE_URL, CLERK_SECRET_KEY, IMPORT_DIR. Flags: --dry-run (plan
 * and print, write nothing).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClerkClient } from "@clerk/backend";
import { eq, inArray, sql } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { courses, rounds, userCourses, users } from "../src/db/schema";
import { normalizeName } from "@coursebook/domain/catalog/course";
import { courseView } from "../src/domain/course-view";
import { parseCSV } from "../src/domain/opengolf";
import {
  planMemberships,
  remapRounds,
  usernameFor,
  type ExportedMembership,
  type ExportedProfile,
  type ExportedRound,
} from "./import/plan";

const dryRun = process.argv.includes("--dry-run");
// Exports stay outside the repository tree that is committed: the default is
// the gitignored .import/ at the repository root, whatever the working directory.
const importDir = process.env["IMPORT_DIR"] ?? fileURLToPath(new URL("../../../.import", import.meta.url));
const databaseUrl = process.env["DATABASE_URL"];
const clerkSecretKey = process.env["CLERK_SECRET_KEY"];
if (!databaseUrl || !clerkSecretKey) {
  console.error("DATABASE_URL and CLERK_SECRET_KEY are required");
  process.exit(1);
}

const readCsv = (name: string) => parseCSV(readFileSync(join(importDir, name), "utf8"));
const text = (value: unknown) => (typeof value === "string" && value.length ? value : null);
const num = (value: unknown) => (typeof value === "string" && value.length ? Number(value) : null);
const bool = (value: unknown) => value === "true" || value === "t";

const profiles: ExportedProfile[] = readCsv("profiles.csv").map((row) => ({
  id: String(row["id"]),
  email: text(row["email"]),
  username: text(row["username"]),
  display_name: text(row["display_name"]),
  avatar_url: text(row["avatar_url"]),
}));
const exportedCourses = readCsv("courses.csv").map((row) => ({
  id: String(row["id"]),
  name: String(row["name"]),
  city: text(row["city"]),
  state: text(row["state"]),
  country: text(row["country"]) ?? "USA",
  logo_url: text(row["logo_url"]),
  website_url: text(row["website_url"]),
  is_custom: bool(row["is_custom"]),
  created_at: text(row["created_at"]),
}));
const memberships: ExportedMembership[] = readCsv("user_courses.csv").map((row) => ({
  id: String(row["id"]),
  user_id: String(row["user_id"]),
  course_id: String(row["course_id"]),
  personal_rank: num(row["personal_rank"]),
  created_at: text(row["created_at"]),
  notes: text(row["notes"]),
}));
const exportedRounds: ExportedRound[] = readCsv("rounds.csv").map((row) => ({
  id: String(row["id"]),
  user_id: String(row["user_id"]),
  course_id: String(row["course_id"]),
  played_at: text(row["played_at"])?.slice(0, 10) ?? null,
  score: num(row["score"]),
  tees: text(row["tees"]),
  notes: text(row["notes"]),
  created_at: text(row["created_at"]),
}));

console.log(`read ${String(profiles.length)} profiles, ${String(exportedCourses.length)} courses, ${String(memberships.length)} memberships, ${String(exportedRounds.length)} rounds from ${importDir}`);

const { db, pool } = createDatabase(databaseUrl);
const clerk = createClerkClient({ secretKey: clerkSecretKey });

try {
  // 1. Courses: insert anything the catalog lacks, keeping ids.
  const existingIds = new Set((await db.select({ id: courses.id }).from(courses)).map((row) => row.id));
  const missingCourses = exportedCourses.filter((row) => !existingIds.has(row.id));
  console.log(`courses to insert: ${String(missingCourses.length)}`);
  if (!dryRun && missingCourses.length) {
    await db.insert(courses).values(
      missingCourses.map((row) => ({
        id: row.id,
        name: row.name,
        nameKey: normalizeName(row.name),
        city: row.city,
        state: row.state,
        country: row.country,
        logoUrl: row.logo_url,
        websiteUrl: row.website_url,
        isCustom: row.is_custom,
      })),
    ).onConflictDoNothing();
  }
  const catalogRows = await db.select().from(courses);
  const catalog = new Map(catalogRows.map((row) => [row.id, courseView(row)]));
  for (const row of missingCourses) if (dryRun) catalog.set(row.id, courseView({ ...row, stableId: null, nameKey: normalizeName(row.name), logoUrl: row.logo_url, websiteUrl: row.website_url, isCustom: row.is_custom, createdBy: null, createdAt: new Date() }));

  // 2. Users via Clerk.
  const taken = new Set((await db.select({ username: users.username }).from(users)).map((row) => row.username.toLowerCase()));
  const userIdMap = new Map<string, string>();
  const unmatched: string[] = [];
  for (const profile of profiles) {
    if (!profile.email) {
      unmatched.push(`${profile.id} has no email`);
      continue;
    }
    const username = usernameFor(profile, taken);
    taken.add(username.toLowerCase());
    let clerkId: string;
    const { data } = await clerk.users.getUserList({ emailAddress: [profile.email] });
    const found = data[0];
    if (found) {
      clerkId = found.id;
      console.log(`matched ${profile.email} -> ${clerkId}`);
    } else if (dryRun) {
      clerkId = "dry-run:" + profile.id;
      console.log(`would create Clerk user ${profile.email} as ${username}`);
    } else {
      const created = await clerk.users.createUser({
        emailAddress: [profile.email],
        username,
        firstName: profile.display_name ?? username,
        skipPasswordRequirement: true,
      });
      clerkId = created.id;
      console.log(`created Clerk user ${profile.email} -> ${clerkId}`);
    }
    userIdMap.set(profile.id, clerkId);
    if (!dryRun)
      await db
        .insert(users)
        .values({
          id: clerkId,
          username: found?.username ?? username,
          displayName: found?.fullName ?? profile.display_name ?? username,
          email: profile.email,
          avatarUrl: profile.avatar_url,
          legacySupabaseId: profile.id,
        })
        .onConflictDoUpdate({ target: users.id, set: { legacySupabaseId: profile.id, updatedAt: sql`now()` } });
  }

  // 3. Memberships and rounds.
  const plan = planMemberships(memberships, exportedRounds, catalog);
  const remapped = remapRounds(exportedRounds, plan.merged);
  let membershipCount = 0;
  let roundCount = 0;
  for (const [supabaseId, order] of plan.order) {
    const clerkId = userIdMap.get(supabaseId);
    if (!clerkId) {
      unmatched.push(`${supabaseId} has ${String(order.length)} memberships but no profile`);
      continue;
    }
    membershipCount += order.length;
    const userRounds = remapped.filter((round) => round.user_id === supabaseId && order.includes(round.course_id));
    roundCount += userRounds.length;
    if (dryRun) continue;
    await db.transaction(async (tx) => {
      await tx.delete(rounds).where(eq(rounds.userId, clerkId));
      await tx.delete(userCourses).where(eq(userCourses.userId, clerkId));
      await tx.insert(userCourses).values(
        order.map((courseId, index) => ({
          userId: clerkId,
          courseId,
          personalRank: index + 1,
          notes: memberships.find((m) => m.user_id === supabaseId && m.course_id === courseId)?.notes ?? null,
        })),
      );
      if (userRounds.length)
        await tx.insert(rounds).values(
          userRounds.map((round) => ({
            id: round.id,
            userId: clerkId,
            courseId: round.course_id,
            ...(round.played_at ? { playedAt: round.played_at } : {}),
            score: round.score,
            tees: round.tees,
            notes: round.notes,
            ...(round.created_at ? { createdAt: new Date(round.created_at) } : {}),
          })),
        );
    });
  }

  // 4. Verification.
  console.log(`\nplanned: ${String(plan.order.size)} members, ${String(membershipCount)} memberships (${String(plan.orphans.length)} from rounds only, ${String([...plan.merged.values()].reduce((n, m) => n + m.size, 0))} duplicates merged), ${String(roundCount)} rounds`);
  if (unmatched.length) console.log("unmatched:\n  " + unmatched.join("\n  "));
  if (!dryRun) {
    const clerkIds = [...userIdMap.values()];
    const [members] = await db.select({ n: sql<string>`count(*)` }).from(users).where(inArray(users.id, clerkIds));
    const [lists] = await db.select({ n: sql<string>`count(*)` }).from(userCourses).where(inArray(userCourses.userId, clerkIds));
    const [played] = await db.select({ n: sql<string>`count(*)` }).from(rounds).where(inArray(rounds.userId, clerkIds));
    const gaps = await db.execute(sql`select user_id from user_courses group by user_id having count(*) <> max(personal_rank)`);
    console.log(`written: ${String(members?.n)} users, ${String(lists?.n)} memberships, ${String(played?.n)} rounds; members with non-contiguous ranks: ${String(gaps.rows.length)}`);
  } else {
    console.log("dry run: nothing written");
  }
} finally {
  await pool.end();
}
