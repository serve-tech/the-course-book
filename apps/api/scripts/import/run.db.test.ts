import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { courses, rounds, userCourses, users } from "../../src/db/schema";
import { resetMemberData, testDatabase } from "../../src/test/db";
import type { SupabaseExport } from "./rows";
import { runImport, verifyImport, type ExistingAccount, type ImportAccounts, type NewAccount } from "./run";

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
});

const U1 = "6f1c2a3b-4d5e-4f60-8a71-000000000001";
const U2 = "6f1c2a3b-4d5e-4f60-8a71-000000000002";
const CUSTOM = "0e5f1c2a-7b1d-4c55-9a51-00000000c001";
const HASH = "$2a$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ01234";

const seeded = async (stableId: string) => {
  const [row] = await db.select({ id: courses.id }).from(courses).where(eq(courses.stableId, stableId));
  if (!row) throw new Error("missing " + stableId);
  return row.id;
};

/** A Clerk directory in memory: accounts by email, and what the import created. */
function fakeAccounts(existing: (ExistingAccount & { email: string })[] = []) {
  const byEmail = new Map(existing.map((account) => [account.email.toLowerCase(), account as ExistingAccount]));
  const created: NewAccount[] = [];
  const accounts: ImportAccounts = {
    findByEmail: (email) => Promise.resolve(byEmail.get(email.toLowerCase()) ?? null),
    create: (account) => {
      created.push(account);
      const id = `user_import_${String(created.length)}`;
      byEmail.set(account.email.toLowerCase(), { id, username: account.username, fullName: account.firstName });
      return Promise.resolve(id);
    },
  };
  return { accounts, created };
}

async function exportFixture(): Promise<SupabaseExport> {
  const [usa1, usa2, usa3] = await Promise.all(["usa1", "usa2", "usa3"].map(seeded));
  const membership = (id: string, user_id: string, course_id: string, personal_rank: number) => ({
    id,
    user_id,
    course_id,
    personal_rank,
    times_played: null,
    created_at: null,
    notes: null,
  });
  const round = (id: string, user_id: string, course_id: string, played_at: string | null = "2026-05-01") => ({
    id,
    user_id,
    course_id,
    played_at,
    score: null,
    tees: null,
    notes: null,
    created_at: "2026-05-02 12:00:00+00",
  });
  return {
    authUsers: [
      { id: U1, email: "one@example.com", encrypted_password: HASH },
      { id: U2, email: "two@example.com", encrypted_password: null },
    ],
    profiles: [
      { id: U1, email: "one@example.com", username: "golfer", display_name: "One Golfer", avatar_url: null },
      { id: U2, email: "two@example.com", username: "bee", display_name: "Bee", avatar_url: null },
    ],
    courses: [
      { id: CUSTOM, name: "Backyard Nine", city: "Hometown", state: "OH", country: "USA", logo_url: null, website_url: null, is_custom: true, created_at: null },
    ],
    memberships: [
      membership("11111111-1111-4111-8111-000000000001", U1, usa1 ?? "", 2),
      membership("11111111-1111-4111-8111-000000000002", U1, usa2 ?? "", 1),
      membership("11111111-1111-4111-8111-000000000003", U1, CUSTOM, 3),
      membership("11111111-1111-4111-8111-000000000004", U2, usa1 ?? "", 1),
    ],
    rounds: [
      round("22222222-2222-4222-8222-000000000001", U1, usa1 ?? ""),
      round("22222222-2222-4222-8222-000000000002", U1, usa1 ?? ""),
      round("22222222-2222-4222-8222-000000000003", U1, CUSTOM),
      round("22222222-2222-4222-8222-000000000004", U1, usa3 ?? ""),
      round("22222222-2222-4222-8222-000000000005", U2, usa1 ?? "", null),
    ],
  };
}

const log = () => undefined;
const total = async (table: typeof users | typeof userCourses | typeof rounds) => (await db.select({ n: count() }).from(table))[0]?.n;

describe("member import", () => {
  it("writes every member, list entry and round, and verifies them", async () => {
    const data = await exportFixture();
    const { accounts, created } = fakeAccounts();
    const result = await runImport({ db, accounts, log }, data, { dryRun: false });

    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
    expect(created.map((account) => [account.email, account.username, account.externalId, account.passwordDigest])).toEqual([
      ["one@example.com", "golfer", U1, HASH],
      ["two@example.com", "bee", U2, null],
    ]);
    const u1 = result.accounts.get(U1) ?? "";
    const [row] = await db.select().from(users).where(eq(users.id, u1));
    expect(row).toMatchObject({ username: "golfer", displayName: "One Golfer", legacySupabaseId: U1 });
    const list = await db.select().from(userCourses).where(eq(userCourses.userId, u1)).orderBy(userCourses.personalRank);
    expect(list.map((entry) => [entry.courseId, entry.personalRank])).toEqual([
      [await seeded("usa2"), 1],
      [await seeded("usa1"), 2],
      [CUSTOM, 3],
      [await seeded("usa3"), 4],
    ]);
    expect(await total(rounds)).toBe(5);
    const [dated] = await db.select().from(rounds).where(eq(rounds.id, "22222222-2222-4222-8222-000000000005"));
    expect(dated?.playedAt).toBe("2026-05-02");
    const [custom] = await db.select().from(courses).where(eq(courses.id, CUSTOM));
    expect(custom).toMatchObject({ name: "Backyard Nine", isCustom: true });
  });

  it("reruns without creating accounts again or duplicating rows", async () => {
    const data = await exportFixture();
    const { accounts, created } = fakeAccounts();
    await runImport({ db, accounts, log }, data, { dryRun: false });
    const again = await runImport({ db, accounts, log }, data, { dryRun: false });
    expect(again.ok).toBe(true);
    expect(again.created).toBe(0);
    expect(created).toHaveLength(2);
    expect([await total(users), await total(userCourses), await total(rounds)]).toEqual([2, 5, 5]);
  });

  it("keeps an existing Clerk account and its username", async () => {
    const data = await exportFixture();
    const { accounts, created } = fakeAccounts([{ id: "user_existing", email: "TWO@example.com", username: "golfer", fullName: "Bee Existing" }]);
    const result = await runImport({ db, accounts, log }, data, { dryRun: false });
    expect(result.accounts.get(U2)).toBe("user_existing");
    expect(created.map((account) => account.username)).toEqual(["golfer2"]);
    const [row] = await db.select().from(users).where(eq(users.id, "user_existing"));
    expect(row).toMatchObject({ username: "golfer", displayName: "Bee Existing" });
  });

  it("writes nothing when a row cannot be placed", async () => {
    const data = await exportFixture();
    const [first] = data.rounds;
    if (!first) throw new Error("fixture has no rounds");
    data.rounds.push({ ...first, id: "22222222-2222-4222-8222-000000000009", course_id: "0e5f1c2a-7b1d-4c55-9a51-00000000dead" });
    const { accounts, created } = fakeAccounts();
    const result = await runImport({ db, accounts, log }, data, { dryRun: false });
    expect(result.ok).toBe(false);
    expect(result.plan.problems).toHaveLength(1);
    expect(created).toEqual([]);
    expect([await total(users), await total(rounds)]).toEqual([0, 0]);
  });

  it("writes nothing on a dry run", async () => {
    const { accounts, created } = fakeAccounts();
    const result = await runImport({ db, accounts, log }, await exportFixture(), { dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.accounts.get(U1)).toBe(`dry-run:${U1}`);
    expect(created).toEqual([]);
    expect(await total(users)).toBe(0);
  });

  it("verification catches a database that differs from the plan", async () => {
    const { accounts } = fakeAccounts();
    const result = await runImport({ db, accounts, log }, await exportFixture(), { dryRun: false });
    await db.delete(rounds).where(eq(rounds.id, "22222222-2222-4222-8222-000000000003"));
    expect(await verifyImport(db, result.plan, result.accounts)).toEqual([
      `member ${U1}: rounds differ (3 stored, expected 4)`,
    ]);
  });
});
