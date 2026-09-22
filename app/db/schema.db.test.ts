import { count, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { expectDbError, resetMemberData, testDatabase } from "../test/db";
import { courseRankings, courses, rounds, userCourses, users } from "./schema";

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
});

async function member(id = "user_a", username = "alpha") {
  await db.insert(users).values({ id, username, displayName: username });
  return id;
}

async function seededCourse(stableId: string) {
  const [row] = await db
    .select()
    .from(courses)
    .where(eq(courses.stableId, stableId));
  if (!row) throw new Error("missing seeded course " + stableId);
  return row;
}

describe("seeded catalog", () => {
  it("contains the published catalog and the bundled stable ids", async () => {
    const [courseTotal] = await db.select({ n: count() }).from(courses);
    const [rankingTotal] = await db.select({ n: count() }).from(courseRankings);
    expect(courseTotal?.n).toBeGreaterThanOrEqual(1389);
    expect(rankingTotal?.n).toBe(1430);
    for (const stableId of ["usa1", "michigan11", "world1"]) {
      expect((await seededCourse(stableId)).nameKey).not.toBe("");
    }
  });
});

describe("schema rules", () => {
  it("rejects a round without a membership", async () => {
    const userId = await member();
    const course = await seededCourse("usa1");
    await expectDbError(
      db.insert(rounds).values({ userId, courseId: course.id }),
      /rounds_membership_fk/,
    );
  });

  it("cascades rounds when the membership is deleted", async () => {
    const userId = await member();
    const course = await seededCourse("usa1");
    await db.insert(userCourses).values({ userId, courseId: course.id, personalRank: 1 });
    await db.insert(rounds).values([{ userId, courseId: course.id }, { userId, courseId: course.id }]);
    await db.delete(userCourses).where(eq(userCourses.userId, userId));
    const [remaining] = await db.select({ n: count() }).from(rounds).where(eq(rounds.userId, userId));
    expect(remaining?.n).toBe(0);
  });

  it("allows swapping ranks inside one transaction but not duplicates at commit", async () => {
    const userId = await member();
    const a = await seededCourse("usa1");
    const b = await seededCourse("usa2");
    await db.insert(userCourses).values([
      { userId, courseId: a.id, personalRank: 1 },
      { userId, courseId: b.id, personalRank: 2 },
    ]);
    await db.transaction(async (tx) => {
      await tx.update(userCourses).set({ personalRank: 2 }).where(eq(userCourses.courseId, a.id));
      await tx.update(userCourses).set({ personalRank: 1 }).where(eq(userCourses.courseId, b.id));
    });
    const ranks = await db
      .select({ courseId: userCourses.courseId, rank: userCourses.personalRank })
      .from(userCourses)
      .where(eq(userCourses.userId, userId));
    expect(Object.fromEntries(ranks.map((r) => [r.courseId, r.rank]))).toEqual({ [a.id]: 2, [b.id]: 1 });

    await expectDbError(
      db.transaction(async (tx) => {
        await tx.update(userCourses).set({ personalRank: 1 }).where(eq(userCourses.courseId, a.id));
      }),
      /user_courses_user_rank_unique/,
    );
  });

  it("treats usernames as unique regardless of case", async () => {
    await member("user_a", "Golfer");
    await expectDbError(member("user_b", "golfer"), /users_username_lower_idx/);
  });

  it("keeps ranks positive", async () => {
    const userId = await member();
    const course = await seededCourse("usa1");
    await expectDbError(
      db.insert(userCourses).values({ userId, courseId: course.id, personalRank: 0 }),
      /user_courses_rank_positive/,
    );
    await expect(db.execute(sql`select 1`)).resolves.toBeDefined();
  });
});
