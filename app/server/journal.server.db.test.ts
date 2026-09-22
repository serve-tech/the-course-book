import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { courses, rounds, userCourses, users } from "../db/schema";
import { resetMemberData, testDatabase } from "../test/db";
import { addFromRankings, listSummary } from "./journal.server";

const { db, pool } = testDatabase();
const USER = "user_j";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
  await db.insert(users).values({ id: USER, username: "journal", displayName: "Journal" });
});

const seeded = async (stableId: string) => {
  const [row] = await db.select({ id: courses.id }).from(courses).where(eq(courses.stableId, stableId));
  if (!row) throw new Error("missing " + stableId);
  return row.id;
};

const memberships = () =>
  db
    .select({ courseId: userCourses.courseId, rank: userCourses.personalRank })
    .from(userCourses)
    .where(eq(userCourses.userId, USER))
    .orderBy(userCourses.personalRank);

describe("add from rankings", () => {
  it("appends a membership at the bottom and logs a first round", async () => {
    const a = await seeded("usa1");
    const b = await seeded("usa2");
    await addFromRankings(db, USER, a);
    await addFromRankings(db, USER, b);
    expect(await memberships()).toEqual([
      { courseId: a, rank: 1 },
      { courseId: b, rank: 2 },
    ]);
    expect(await listSummary(db, USER)).toEqual({ played: { [a]: 1, [b]: 1 }, onList: [a, b] });
  });

  it("never adds a second round or changes rank for a course already played", async () => {
    const a = await seeded("usa1");
    const b = await seeded("usa2");
    await addFromRankings(db, USER, a);
    await addFromRankings(db, USER, b);
    await addFromRankings(db, USER, a);
    expect(await memberships()).toEqual([
      { courseId: a, rank: 1 },
      { courseId: b, rank: 2 },
    ]);
    expect((await db.select().from(rounds).where(eq(rounds.userId, USER))).length).toBe(2);
  });

  it("rejects an unknown course with a 404 response and writes nothing", async () => {
    await expect(
      addFromRankings(db, USER, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ init: { status: 404 } });
    expect(await memberships()).toEqual([]);
  });
});
