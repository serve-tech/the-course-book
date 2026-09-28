/**
 * Execute the member import: plan it, stop on any problem, resolve or create
 * each member's Clerk account, write courses, users, lists and rounds, then
 * verify the database against the plan.
 *
 * Clerk sits behind `ImportAccounts`, so the database test runs the real
 * writes with a fake directory. Reruns are safe before launch: accounts are
 * found by email, missing courses are inserted once, and each member's list
 * and rounds are replaced in one transaction. Once members use the new site a
 * rerun would replace their new lists, so it must not run then.
 *
 * Password digests pass straight from the plan to Clerk and are never logged.
 */
import type { ClerkClient } from "@clerk/backend";
import { asc, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import { normalizeName, type Course } from "@coursebook/domain/catalog/course";
import type { Database } from "../../src/db/client";
import { courses, rounds, userCourses, users } from "../../src/db/schema";
import { courseView } from "../../src/domain/course-view";
import { assignUsernames, planImport, summarizeLedger, type ImportPlan, type PlannedMember } from "./plan";
import type { SupabaseExport } from "./rows";

/** A Clerk account that already has the member's email address. */
export interface ExistingAccount {
  id: string;
  username: string | null;
  fullName: string | null;
}

/** What the import asks Clerk to create for a member. */
export interface NewAccount {
  email: string;
  username: string;
  firstName: string;
  /** The Supabase user id, recorded as Clerk's external id. */
  externalId: string;
  /** bcrypt digest from Supabase Auth, or null for no password. */
  passwordDigest: string | null;
}

/** The Clerk operations the import needs. */
export interface ImportAccounts {
  findByEmail(email: string): Promise<ExistingAccount | null>;
  /** Create the account and return its Clerk user id. */
  create(account: NewAccount): Promise<string>;
}

/**
 * `ImportAccounts` over Clerk's Backend API. A member with a digest keeps
 * their Supabase password (`passwordHasher: "bcrypt"`); one without gets no
 * password and signs in with Google or a reset.
 */
export function clerkImportAccounts(clerkUsers: Pick<ClerkClient["users"], "getUserList" | "createUser">): ImportAccounts {
  return {
    async findByEmail(email) {
      const { data } = await clerkUsers.getUserList({ emailAddress: [email] });
      const user = data[0];
      return user ? { id: user.id, username: user.username, fullName: user.fullName } : null;
    },
    async create(account) {
      const user = await clerkUsers.createUser({
        emailAddress: [account.email],
        username: account.username,
        firstName: account.firstName,
        externalId: account.externalId,
        ...(account.passwordDigest
          ? { passwordDigest: account.passwordDigest, passwordHasher: "bcrypt" as const }
          : { skipPasswordRequirement: true }),
      });
      return user.id;
    },
  };
}

export interface ImportResult {
  /** True when the plan had no problems and, for a real run, the database matched it. */
  ok: boolean;
  plan: ImportPlan;
  /** Differences between the database and the plan after writing. */
  mismatches: string[];
  /** Clerk account per Supabase id; `dry-run:` ids for accounts a dry run would create. */
  accounts: Map<string, string>;
  created: number;
}

interface Dependencies {
  db: Database;
  accounts: ImportAccounts;
  log: (line: string) => void;
}

function report(plan: ImportPlan, log: (line: string) => void): void {
  for (const [table, counts] of summarizeLedger(plan.ledger)) {
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    log(`${table}: ${String(total)} rows = ${[...counts].map(([kind, count]) => `${String(count)} ${kind}`).join(", ")}`);
  }
  for (const entry of plan.ledger) {
    if (entry.outcome.kind === "merged") log(`  merged: ${entry.table} ${entry.id} into course ${entry.outcome.into}`);
    if (entry.outcome.kind === "moved") log(`  moved: ${entry.table} ${entry.id} to course ${entry.outcome.to}`);
  }
  for (const notice of plan.notices) log(`notice: ${notice}`);
}

/**
 * Plan, write and verify the import.
 *
 * Args:
 *     deps: Database, Clerk accounts and a line logger.
 *     data: The validated export (rows.ts).
 *     options: `dryRun` plans and reports, looks accounts up but writes
 *         nothing.
 *
 * Returns:
 *     The plan and, for a real run, any mismatch between the database and
 *     the plan. `ok` is false when the plan has problems (nothing is
 *     written) or the database does not match it.
 */
export async function runImport(deps: Dependencies, data: SupabaseExport, options: { dryRun: boolean }): Promise<ImportResult> {
  const { db, accounts, log } = deps;
  const catalog = new Map<string, Course>((await db.select().from(courses)).map((row) => [row.id, courseView(row)]));
  const plan = planImport(data, catalog);
  report(plan, log);
  if (plan.problems.length) {
    log(`\n${String(plan.problems.length)} problems; nothing was written:`);
    for (const problem of plan.problems) log(`  ${problem}`);
    return { ok: false, plan, mismatches: [], accounts: new Map(), created: 0 };
  }

  // Accounts first, so usernames of existing Clerk accounts are known before any are chosen.
  const found = new Map<string, ExistingAccount>();
  for (const member of plan.members) {
    const account = await accounts.findByEmail(member.email);
    if (account) found.set(member.supabaseId, account);
  }
  const importIds = plan.members.map((member) => member.supabaseId);
  const others = await db
    .select({ username: users.username })
    .from(users)
    .where(importIds.length ? or(isNull(users.legacySupabaseId), notInArray(users.legacySupabaseId, importIds)) : undefined);
  const usernames = assignUsernames(
    plan.members,
    new Map([...found].map(([supabaseId, account]) => [supabaseId, account.username])),
    new Set(others.map((row) => row.username.toLowerCase())),
  );
  const withPassword = plan.members.filter((member) => !found.has(member.supabaseId) && member.passwordDigest).length;
  log(`accounts: ${String(found.size)} found in Clerk, ${String(plan.members.length - found.size)} to create (${String(withPassword)} keep their password)`);

  const accountIds = new Map<string, string>();
  if (options.dryRun) {
    for (const member of plan.members) accountIds.set(member.supabaseId, found.get(member.supabaseId)?.id ?? `dry-run:${member.supabaseId}`);
    log("dry run: nothing written");
    return { ok: true, plan, mismatches: [], accounts: accountIds, created: 0 };
  }

  if (plan.newCourses.length) {
    await db
      .insert(courses)
      .values(
        plan.newCourses.map((row) => ({
          id: row.id,
          name: row.name,
          nameKey: normalizeName(row.name),
          city: row.city,
          state: row.state,
          country: row.country ?? "USA",
          logoUrl: row.logo_url,
          websiteUrl: row.website_url,
          isCustom: row.is_custom ?? false,
          ...(row.created_at ? { createdAt: new Date(row.created_at) } : {}),
        })),
      )
      .onConflictDoNothing();
  }

  let created = 0;
  for (const member of plan.members) {
    const username = usernames.get(member.supabaseId) ?? "";
    const existing = found.get(member.supabaseId);
    const clerkId = existing?.id ?? (await accounts.create(newAccount(member, username)));
    if (!existing) created++;
    accountIds.set(member.supabaseId, clerkId);
    await db
      .insert(users)
      .values({
        id: clerkId,
        username,
        displayName: existing?.fullName ?? member.displayName,
        email: member.email,
        avatarUrl: member.avatarUrl,
        legacySupabaseId: member.supabaseId,
      })
      .onConflictDoUpdate({ target: users.id, set: { legacySupabaseId: member.supabaseId, updatedAt: new Date() } });

    const entries = plan.lists.get(member.supabaseId) ?? [];
    const played = plan.rounds.get(member.supabaseId) ?? [];
    await db.transaction(async (tx) => {
      await tx.delete(rounds).where(eq(rounds.userId, clerkId));
      await tx.delete(userCourses).where(eq(userCourses.userId, clerkId));
      if (entries.length)
        await tx.insert(userCourses).values(
          entries.map((entry) => ({ userId: clerkId, courseId: entry.courseId, personalRank: entry.rank, notes: entry.notes })),
        );
      if (played.length)
        await tx.insert(rounds).values(
          played.map((round) => ({
            id: round.id,
            userId: clerkId,
            courseId: round.courseId,
            playedAt: round.playedOn,
            score: round.score,
            tees: round.tees,
            notes: round.notes,
            ...(round.createdAt ? { createdAt: new Date(round.createdAt) } : {}),
          })),
        );
    });
  }
  log(`written: ${String(plan.members.length)} members (${String(created)} Clerk accounts created)`);

  const mismatches = await verifyImport(db, plan, accountIds);
  if (mismatches.length) {
    log(`\n${String(mismatches.length)} mismatches between the database and the plan:`);
    for (const mismatch of mismatches) log(`  ${mismatch}`);
  } else {
    log("verified: every list, rank and round matches the plan");
  }
  return { ok: mismatches.length === 0, plan, mismatches, accounts: accountIds, created };
}

function newAccount(member: PlannedMember, username: string): NewAccount {
  return {
    email: member.email,
    username,
    firstName: member.displayName,
    externalId: member.supabaseId,
    passwordDigest: member.passwordDigest,
  };
}

/**
 * Compare the database with the plan: every new course exists, and each
 * member's list (course order and ranks) and set of round ids are exactly
 * the planned ones.
 */
export async function verifyImport(db: Database, plan: ImportPlan, accountIds: ReadonlyMap<string, string>): Promise<string[]> {
  const mismatches: string[] = [];
  const newIds = plan.newCourses.map((row) => row.id);
  if (newIds.length) {
    const present = await db.select({ id: courses.id }).from(courses).where(inArray(courses.id, newIds));
    if (present.length !== newIds.length) mismatches.push(`courses: ${String(newIds.length - present.length)} of ${String(newIds.length)} new courses are missing`);
  }
  for (const member of plan.members) {
    const clerkId = accountIds.get(member.supabaseId) ?? "";
    const list = await db
      .select({ courseId: userCourses.courseId, rank: userCourses.personalRank })
      .from(userCourses)
      .where(eq(userCourses.userId, clerkId))
      .orderBy(asc(userCourses.personalRank));
    const expectedList = (plan.lists.get(member.supabaseId) ?? []).map((entry) => `${entry.courseId}@${String(entry.rank)}`);
    const actualList = list.map((entry) => `${entry.courseId}@${String(entry.rank)}`);
    if (expectedList.join() !== actualList.join()) mismatches.push(`member ${member.supabaseId}: list differs (${String(actualList.length)} entries, expected ${String(expectedList.length)})`);
    const stored = await db
      .select({ id: rounds.id, courseId: rounds.courseId })
      .from(rounds)
      .where(eq(rounds.userId, clerkId));
    const expectedRounds = (plan.rounds.get(member.supabaseId) ?? []).map((round) => `${round.id}@${round.courseId}`).sort();
    const actualRounds = stored.map((round) => `${round.id}@${round.courseId}`).sort();
    if (expectedRounds.join() !== actualRounds.join()) mismatches.push(`member ${member.supabaseId}: rounds differ (${String(actualRounds.length)} stored, expected ${String(expectedRounds.length)})`);
  }
  return mismatches;
}
