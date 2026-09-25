import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { courses, users } from "../db/schema";
import { resetMemberData, testDatabase } from "../test/db";
import { logRounds } from "./journal";
import { memberList, members } from "./friends";

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
  await db.insert(users).values([
    { id: "user_a", username: "alpha", displayName: "Alpha", email: "alpha@example.com" },
    { id: "user_b", username: "bravo", displayName: "Bravo", email: "bravo@example.com" },
    { id: "user_gone", username: "gone", displayName: "Gone", deletedAt: new Date() },
  ]);
});

const seeded = async (stableId: string) => {
  const [row] = await db.select({ id: courses.id }).from(courses).where(eq(courses.stableId, stableId));
  if (!row) throw new Error("missing " + stableId);
  return row.id;
};

describe("member directory", () => {
  it("lists other active members with public fields only", async () => {
    const list = await members(db, "user_a");
    expect(list).toEqual([{ username: "bravo", displayName: "Bravo" }]);
    expect(JSON.stringify(list)).not.toContain("example.com");
  });
});

describe("member list", () => {
  it("returns the member's ranking with on-my-list evidence", async () => {
    const a = await seeded("usa1");
    const b = await seeded("usa2");
    await logRounds(db, "user_b", { courseId: b }, 1);
    await logRounds(db, "user_b", { courseId: a }, 1);
    await logRounds(db, "user_a", { courseId: a }, 3);
    const result = await memberList(db, "user_a", "bravo");
    expect(result?.member).toEqual({ username: "bravo", displayName: "Bravo" });
    expect(result?.rows.map((row) => [row.rank, row.course.id, row.onMyList])).toEqual([
      [1, b, false],
      [2, a, true],
    ]);
    expect(JSON.stringify(result)).not.toContain("user_b");
  });

  it("treats an equivalent duplicate catalog row as already listed", async () => {
    const [friars] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.nameKey, "friars head"));
    const duplicates = await db.select({ id: courses.id }).from(courses).where(eq(courses.nameKey, "friars head"));
    if (!friars || duplicates.length < 2) throw new Error("expected duplicate Friar's Head rows in the seed");
    await logRounds(db, "user_b", { courseId: duplicates[0]?.id ?? "" }, 1);
    await logRounds(db, "user_a", { courseId: duplicates[1]?.id ?? "" }, 1);
    const result = await memberList(db, "user_a", "bravo");
    expect(result?.rows[0]?.onMyList).toBe(true);
  });

  it("returns null for unknown or deleted members", async () => {
    expect(await memberList(db, "user_a", "nobody")).toBeNull();
    expect(await memberList(db, "user_a", "gone")).toBeNull();
  });
});
