import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { courses, rounds, userCourses, users } from "../db/schema";
import { resetMemberData, testDatabase } from "../test/db";
import {
  addCustomCourse,
  addFromFriend,
  addFromRankings,
  deleteCourse,
  deleteRound,
  listSummary,
  logRounds,
  moveCourse,
  personalList,
  roundHistory,
  setCount,
} from "./journal";
import { ErrorCode } from "./errors";
import { allCourses, invalidateCatalog } from "./catalog";

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

const ranks = async () =>
  (
    await db
      .select({ courseId: userCourses.courseId, rank: userCourses.personalRank })
      .from(userCourses)
      .where(eq(userCourses.userId, USER))
      .orderBy(userCourses.personalRank)
  ).map((row) => [row.courseId, row.rank] as const);

const roundsFor = (courseId: string) =>
  db.select().from(rounds).where(eq(rounds.courseId, courseId));

const blob = (name: string, location: string, extra: Partial<{ city: string; state: string; country: string }> = {}) => ({
  name,
  location,
  city: extra.city ?? "",
  state: extra.state ?? "",
  country: extra.country ?? "",
  logo: "",
  website: "",
  isCustom: false,
});

describe("logging rounds", () => {
  it("adds the membership at the bottom and N rounds sharing one date", async () => {
    const a = await seeded("usa1");
    const b = await seeded("usa2");
    await logRounds(db, USER, { courseId: a }, 1);
    const result = await logRounds(db, USER, { courseId: b }, 3, "2026-05-01");
    expect(result.count).toBe(3);
    expect(await ranks()).toEqual([[a, 1], [b, 2]]);
    const dates = new Set((await roundsFor(b)).map((row) => row.playedAt));
    expect([...dates]).toEqual(["2026-05-01"]);
  });

  it("never changes an existing membership's rank when logging again", async () => {
    const a = await seeded("usa1");
    const b = await seeded("usa2");
    await logRounds(db, USER, { courseId: a }, 1);
    await logRounds(db, USER, { courseId: b }, 1);
    await logRounds(db, USER, { courseId: a }, 2);
    expect(await ranks()).toEqual([[a, 1], [b, 2]]);
    expect((await listSummary(db, USER)).played[a]).toBe(3);
  });

  it("creates a course from search details when none matches", async () => {
    const before = (await db.select().from(courses)).length;
    const { courseId } = await logRounds(db, USER, blob("Mystery Meadows", "Nowhere, KS, USA", { city: "Nowhere", state: "KS", country: "USA" }), 1);
    expect((await db.select().from(courses)).length).toBe(before + 1);
    const list = await personalList(db, USER);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ rank: 1, played: 1 });
    expect(list[0]?.course).toMatchObject({ id: courseId, name: "Mystery Meadows", location: "Nowhere, KS, USA" });
  });
});

describe("adding from rankings and members", () => {
  it("rankings add logs a first round only and keeps the list order", async () => {
    const a = await seeded("usa1");
    await addFromRankings(db, USER, a);
    await addFromRankings(db, USER, a);
    expect((await roundsFor(a)).filter((row) => row.userId === USER)).toHaveLength(1);
  });

  it("member add is a no-op when the course is already listed", async () => {
    const a = await seeded("usa1");
    await logRounds(db, USER, { courseId: a }, 2);
    expect(await addFromFriend(db, USER, a)).toEqual({ added: false });
    expect((await roundsFor(a)).filter((row) => row.userId === USER)).toHaveLength(2);
    const b = await seeded("usa2");
    expect(await addFromFriend(db, USER, b)).toEqual({ added: true });
    expect(await ranks()).toEqual([[a, 1], [b, 2]]);
  });
});

describe("custom courses", () => {
  it("inserts at the requested rank, clamped, and shifts the others", async () => {
    const a = await seeded("usa1");
    const b = await seeded("usa2");
    await logRounds(db, USER, { courseId: a }, 1);
    await logRounds(db, USER, { courseId: b }, 1);
    const first = await addCustomCourse(db, USER, blob("Backyard Nine", "Hometown, OH, USA", { state: "OH", country: "USA" }), 1);
    expect(first.rank).toBe(1);
    const bottom = await addCustomCourse(db, USER, blob("Far Field", "Elsewhere, OH, USA", { state: "OH", country: "USA" }), 99);
    expect(bottom.rank).toBe(4);
    const unranked = await addCustomCourse(db, USER, blob("Quiet Links", "Somewhere, OH, USA", { state: "OH", country: "USA" }), null);
    expect(unranked.rank).toBe(5);
    expect((await ranks()).map(([, rank]) => rank)).toEqual([1, 2, 3, 4, 5]);
    expect((await ranks())[0]?.[0]).toBe(first.courseId);
    const [row] = await db.select().from(courses).where(eq(courses.id, first.courseId));
    expect(row).toMatchObject({ isCustom: true, createdBy: USER });
  });

  it("keeps the rank and logs a round when the course is already listed", async () => {
    const a = await seeded("usa1");
    await logRounds(db, USER, { courseId: a }, 1);
    const custom = await addCustomCourse(db, USER, blob("Backyard Nine", "Hometown, OH, USA", { state: "OH", country: "USA" }), null);
    const again = await addCustomCourse(db, USER, blob("Backyard Nine", "Hometown, OH, USA", { state: "OH", country: "USA" }), 1);
    expect(again.courseId).toBe(custom.courseId);
    expect(again.rank).toBe(2);
    expect((await listSummary(db, USER)).played[custom.courseId]).toBe(2);
  });
});

describe("moving", () => {
  it("renumbers the full list so hidden courses keep their positions", async () => {
    const ids = await Promise.all(["usa1", "usa2", "usa3", "usa4"].map(seeded));
    for (const id of ids) await logRounds(db, USER, { courseId: id }, 1);
    const [a, b, c, d] = ids as [string, string, string, string];
    expect(await moveCourse(db, USER, d, 2)).toEqual({ rank: 2 });
    expect(await ranks()).toEqual([[a, 1], [d, 2], [b, 3], [c, 4]]);
    expect(await moveCourse(db, USER, a, 99)).toEqual({ rank: 4 });
    expect(await ranks()).toEqual([[d, 1], [b, 2], [c, 3], [a, 4]]);
  });

  it("rejects moving a course that is not on the list", async () => {
    await expect(moveCourse(db, USER, await seeded("usa1"), 1)).rejects.toMatchObject({ status: 404, code: ErrorCode.NotOnList });
  });

  it("serializes concurrent moves so ranks stay contiguous", async () => {
    const ids = await Promise.all(["usa1", "usa2", "usa3"].map(seeded));
    for (const id of ids) await logRounds(db, USER, { courseId: id }, 1);
    await Promise.all([
      moveCourse(db, USER, ids[2] ?? "", 1),
      moveCourse(db, USER, ids[0] ?? "", 3),
      moveCourse(db, USER, ids[1] ?? "", 1),
    ]);
    expect((await ranks()).map(([, rank]) => rank)).toEqual([1, 2, 3]);
  });
});

describe("counts and deletion", () => {
  it("reduces to the newest rounds, adds missing ones, and zero removes the course", async () => {
    const a = await seeded("usa1");
    const b = await seeded("usa2");
    await logRounds(db, USER, { courseId: a }, 1, "2026-01-01");
    await logRounds(db, USER, { courseId: a }, 1, "2026-03-01");
    await logRounds(db, USER, { courseId: a }, 1, "2026-02-01");
    await logRounds(db, USER, { courseId: b }, 1);
    expect(await setCount(db, USER, a, 2)).toEqual({ count: 2, removed: false });
    expect((await roundHistory(db, USER, a)).map((row) => row.playedAt)).toEqual(["2026-03-01", "2026-02-01"]);
    expect(await setCount(db, USER, a, 4)).toEqual({ count: 4, removed: false });
    expect(await roundHistory(db, USER, a)).toHaveLength(4);
    expect(await setCount(db, USER, a, 0)).toEqual({ count: 0, removed: true });
    expect(await ranks()).toEqual([[b, 1]]);
    expect((await roundsFor(a)).filter((row) => row.userId === USER)).toHaveLength(0);
  });

  it("deleting the last round removes the course and closes the rank gap", async () => {
    const a = await seeded("usa1");
    const b = await seeded("usa2");
    await logRounds(db, USER, { courseId: a }, 2);
    await logRounds(db, USER, { courseId: b }, 1);
    const [first, second] = await roundHistory(db, USER, a);
    expect(await deleteRound(db, USER, first?.id ?? "")).toEqual({ removedCourse: false, courseId: a });
    expect(await deleteRound(db, USER, second?.id ?? "")).toEqual({ removedCourse: true, courseId: a });
    expect(await ranks()).toEqual([[b, 1]]);
    await expect(deleteRound(db, USER, second?.id ?? "")).rejects.toMatchObject({ status: 404, code: ErrorCode.RoundNotFound });
  });

  it("deleting a course cascades its rounds and renumbers", async () => {
    const [a, b, c] = (await Promise.all(["usa1", "usa2", "usa3"].map(seeded))) as [string, string, string];
    for (const id of [a, b, c]) await logRounds(db, USER, { courseId: id }, 2);
    await deleteCourse(db, USER, b);
    expect(await ranks()).toEqual([[a, 1], [c, 2]]);
    expect((await roundsFor(b)).filter((row) => row.userId === USER)).toHaveLength(0);
    await expect(deleteCourse(db, USER, b)).rejects.toMatchObject({ status: 404, code: ErrorCode.NotOnList });
  });

  it("never lets one member touch another member's journal", async () => {
    await db.insert(users).values({ id: "user_other", username: "other", displayName: "Other" });
    const a = await seeded("usa1");
    await logRounds(db, "user_other", { courseId: a }, 1);
    const [round] = await roundHistory(db, "user_other", a);
    await expect(deleteRound(db, USER, round?.id ?? "")).rejects.toMatchObject({ status: 404, code: ErrorCode.RoundNotFound });
    await expect(setCount(db, USER, a, 0)).rejects.toMatchObject({ status: 404, code: ErrorCode.NotOnList });
    expect(await roundHistory(db, "user_other", a)).toHaveLength(1);
  });
});

describe("catalog cache after creating a course", () => {
  /** Wait until some statement in this database is blocked on a lock. */
  const waitForLockWait = async () => {
    for (let attempt = 0; attempt < 250; attempt += 1) {
      const { rows } = await pool.query<{ waiting: number }>(
        "select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
      );
      if ((rows[0]?.waiting ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("the journal transaction never waited on the row lock");
  };

  it("includes a new course when a snapshot load raced its transaction", async () => {
    await logRounds(db, USER, { courseId: await seeded("usa1") }, 1);
    invalidateCatalog();
    // Hold a lock that addCustomCourse needs after it inserts the course, so a
    // snapshot can load between the insert and the commit.
    const blocker = await pool.connect();
    try {
      await blocker.query("begin");
      await blocker.query("select 1 from user_courses where user_id = $1 for update", [USER]);
      const creating = addCustomCourse(db, USER, { ...blob("Race Condition Links", "Hometown, OH"), isCustom: true }, null);
      await waitForLockWait();
      await allCourses(db);
      await blocker.query("commit");
      const { courseId } = await creating;
      expect((await allCourses(db)).some((course) => course.id === courseId)).toBe(true);
    } finally {
      blocker.release();
    }
  });
});
