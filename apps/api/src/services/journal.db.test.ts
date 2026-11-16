import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { courses, rounds, userCourses, users } from "../db/schema";
import { insertPlayed, rankNumbers, resetMemberData, testDatabase } from "../test/db";
import {
  addCourseByDetails,
  addToList,
  deleteCourse,
  deleteRound,
  logRounds,
  moveCourse,
  personalList,
  roundHistory,
  setCount,
  wholeList,
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

/** A member's play count for one course, read from their list. */
const playedOn = async (courseId: string) =>
  (await personalList(db, USER)).find((entry) => entry.course.id === courseId)?.played;

/** Add a hand-entered course at `rank` (bottom when null) with one round. */
const addCustom = (input: Parameters<typeof addCourseByDetails>[2], rank: number | null) =>
  addCourseByDetails(db, USER, { ...input, isCustom: true }, { rank, quantity: 1 });

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
    expect(await playedOn(a)).toBe(3);
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

describe("custom courses", () => {
  it("inserts at the requested rank, clamped, and shifts the others", async () => {
    const a = await seeded("usa1");
    const b = await seeded("usa2");
    await logRounds(db, USER, { courseId: a }, 1);
    await logRounds(db, USER, { courseId: b }, 1);
    const first = await addCustom(blob("Backyard Nine", "Hometown, OH, USA", { state: "OH", country: "USA" }), 1);
    expect(first.rank).toBe(1);
    const bottom = await addCustom(blob("Far Field", "Elsewhere, OH, USA", { state: "OH", country: "USA" }), 99);
    expect(bottom.rank).toBe(4);
    const unranked = await addCustom(blob("Quiet Links", "Somewhere, OH, USA", { state: "OH", country: "USA" }), null);
    expect(unranked.rank).toBe(5);
    expect((await ranks()).map(([, rank]) => rank)).toEqual([1, 2, 3, 4, 5]);
    expect((await ranks())[0]?.[0]).toBe(first.courseId);
    const [row] = await db.select().from(courses).where(eq(courses.id, first.courseId));
    expect(row).toMatchObject({ isCustom: true, createdBy: USER });
  });

  it("keeps the rank and logs a round when the course is already listed", async () => {
    const a = await seeded("usa1");
    await logRounds(db, USER, { courseId: a }, 1);
    const custom = await addCustom(blob("Backyard Nine", "Hometown, OH, USA", { state: "OH", country: "USA" }), null);
    const again = await addCustom(blob("Backyard Nine", "Hometown, OH, USA", { state: "OH", country: "USA" }), 1);
    expect(again.courseId).toBe(custom.courseId);
    expect(again.rank).toBe(2);
    expect(await playedOn(custom.courseId)).toBe(2);
  });
});

describe("moving", () => {
  it("renumbers the full list so hidden courses keep their positions", async () => {
    const ids = await Promise.all(["usa1", "usa2", "usa3", "usa4"].map(seeded));
    for (const id of ids) await logRounds(db, USER, { courseId: id }, 1);
    const [a, b, c, d] = ids as [string, string, string, string];
    const moved = await moveCourse(db, USER, d, 2);
    expect(moved.rank).toBe(2);
    expect(await ranks()).toEqual([[a, 1], [d, 2], [b, 3], [c, 4]]);
    // The returned list is read in the same transaction, after the move.
    expect(moved.courses.map((entry) => [entry.course.id, entry.rank])).toEqual(await ranks());
    expect(await moveCourse(db, USER, a, 99)).toMatchObject({ rank: 4 });
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
    expect(await setCount(db, USER, a, 2)).toMatchObject({ count: 2, removed: false });
    expect((await roundHistory(db, USER, a)).map((row) => row.playedAt)).toEqual(["2026-03-01", "2026-02-01"]);
    const raised = await setCount(db, USER, a, 4);
    expect(raised).toMatchObject({ count: 4, removed: false });
    expect(raised.courses.find((entry) => entry.course.id === a)?.played).toBe(4);
    expect(await roundHistory(db, USER, a)).toHaveLength(4);
    const removed = await setCount(db, USER, a, 0);
    expect(removed).toMatchObject({ count: 0, removed: true });
    expect(removed.courses.map((entry) => entry.course.id)).toEqual([b]);
    expect(await ranks()).toEqual([[b, 1]]);
    expect((await roundsFor(a)).filter((row) => row.userId === USER)).toHaveLength(0);
  });

  it("deleting the last round removes the course and closes the rank gap", async () => {
    const a = await seeded("usa1");
    const b = await seeded("usa2");
    await logRounds(db, USER, { courseId: a }, 2);
    await logRounds(db, USER, { courseId: b }, 1);
    const [first, second] = await roundHistory(db, USER, a);
    expect(await deleteRound(db, USER, first?.id ?? "")).toMatchObject({ removedCourse: false, courseId: a });
    const last = await deleteRound(db, USER, second?.id ?? "");
    expect(last).toMatchObject({ removedCourse: true, courseId: a });
    expect(last.courses.map((entry) => entry.course.id)).toEqual([b]);
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

describe("Played courses (on the list without a rank)", () => {
  /** Mark when a Played row became Played, so the order under test does not hang on clock resolution. */
  const playedAt = (courseId: string, iso: string) =>
    db.update(userCourses).set({ updatedAt: new Date(iso) }).where(and(eq(userCourses.userId, USER), eq(userCourses.courseId, courseId)));
  const unrankedIds = async () => (await wholeList(db, USER)).unranked.map((entry) => entry.course.id);

  it("keeps Played courses out of the ranking and lists them most recently Played first", async () => {
    const [a, b, older, newer] = (await Promise.all(["usa1", "usa2", "usa3", "usa4"].map(seeded))) as [string, string, string, string];
    await logRounds(db, USER, { courseId: a }, 1);
    await logRounds(db, USER, { courseId: b }, 2);
    await insertPlayed(db, USER, older);
    await insertPlayed(db, USER, newer);
    await playedAt(older, "2026-10-01T00:00:00Z");
    await playedAt(newer, "2026-11-01T00:00:00Z");
    const list = await wholeList(db, USER);
    expect(list.courses.map((entry) => [entry.course.id, entry.rank, entry.played])).toEqual([
      [a, 1, 1],
      [b, 2, 2],
    ]);
    expect(list.unranked.map((entry) => [entry.course.id, entry.played])).toEqual([
      [newer, 0],
      [older, 0],
    ]);
    expect(await personalList(db, USER)).toEqual(list.courses);
  });

  it("Played order: renumbering the ranking never writes a Played row, so its place in the Played line holds", async () => {
    // The Played line is ordered by updated_at (see userCourses in db/schema.ts).
    // Anything that updates a Played row moves it to the top; renumbering must not.
    const [a, b, older, newer] = (await Promise.all(["usa1", "usa2", "usa3", "usa4"].map(seeded))) as [string, string, string, string];
    await logRounds(db, USER, { courseId: a }, 1);
    await logRounds(db, USER, { courseId: b }, 1);
    await insertPlayed(db, USER, older);
    await insertPlayed(db, USER, newer);
    await playedAt(older, "2026-11-02T00:00:00Z");
    await playedAt(newer, "2026-11-03T00:00:00Z");
    await moveCourse(db, USER, b, 1);
    await deleteCourse(db, USER, a);
    expect(await unrankedIds()).toEqual([newer, older]);
    const [row] = await db.select({ updatedAt: userCourses.updatedAt }).from(userCourses).where(eq(userCourses.courseId, older));
    expect(row?.updatedAt.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it.each([
    [1, ["p", "a", "b", "c"]],
    [2, ["a", "p", "b", "c"]],
    [4, ["a", "b", "c", "p"]],
    [99, ["a", "b", "c", "p"]],
  ])("ranks a Played course when it is moved to %s, shifting the courses below it", async (rank, expected) => {
    const ids = { a: await seeded("usa1"), b: await seeded("usa2"), c: await seeded("usa3"), p: await seeded("usa4") };
    for (const id of [ids.a, ids.b, ids.c]) await logRounds(db, USER, { courseId: id }, 1);
    await insertPlayed(db, USER, ids.p);
    const moved = await moveCourse(db, USER, ids.p, rank);
    const order = expected.map((key) => ids[key as keyof typeof ids]);
    expect(moved.rank).toBe(order.indexOf(ids.p) + 1);
    expect(moved.courses.map((entry) => entry.course.id)).toEqual(order);
    expect(moved.unranked).toEqual([]);
    expect(await rankNumbers(db, USER)).toEqual([1, 2, 3, 4]);
  });

  it("moves a Ranked course past a Played one without ranking it", async () => {
    const [a, b, p] = (await Promise.all(["usa1", "usa2", "usa4"].map(seeded))) as [string, string, string];
    await logRounds(db, USER, { courseId: a }, 1);
    await logRounds(db, USER, { courseId: b }, 1);
    await insertPlayed(db, USER, p);
    expect(await moveCourse(db, USER, a, 99)).toMatchObject({ rank: 2 });
    expect(await ranks()).toEqual([[b, 1], [a, 2], [p, null]]);
  });

  it("is ranked at the bottom by the operations that predate Played courses, which old clients use", async () => {
    const [a, viaLog, viaAdd] = (await Promise.all(["usa1", "usa2", "usa3"].map(seeded))) as [string, string, string];
    await logRounds(db, USER, { courseId: a }, 1);
    await insertPlayed(db, USER, viaLog);
    await insertPlayed(db, USER, viaAdd);
    const logged = await logRounds(db, USER, { courseId: viaLog }, 1);
    expect(logged.courses.map((entry) => [entry.course.id, entry.rank])).toEqual([[a, 1], [viaLog, 2]]);
    const added = await addToList(db, USER, viaAdd);
    expect(added.added).toBe(false);
    expect(added.courses.map((entry) => [entry.course.id, entry.rank, entry.played])).toEqual([
      [a, 1, 1],
      [viaLog, 2, 1],
      [viaAdd, 3, 1],
    ]);
    expect(added.unranked).toEqual([]);
  });

  it("is ranked at the requested rank when added again by details, so the response's rank is real", async () => {
    await logRounds(db, USER, { courseId: await seeded("usa1") }, 1);
    const details = { ...blob("Brand New Links", "Hometown, OH, USA", { city: "Hometown", state: "OH", country: "USA" }), isCustom: true };
    const first = await addCourseByDetails(db, USER, details, { rank: null, quantity: 1 });
    await db.update(userCourses).set({ personalRank: null }).where(eq(userCourses.courseId, first.courseId));
    const again = await addCourseByDetails(db, USER, details, { rank: 1, quantity: 1 });
    expect(again).toMatchObject({ courseId: first.courseId, rank: 1 });
    expect(again.unranked).toEqual([]);
    expect(await rankNumbers(db, USER)).toEqual([1, 2]);
  });

  it("keeps a Played course off the ranking when it is removed, and the ranks contiguous", async () => {
    const [a, b, p] = (await Promise.all(["usa1", "usa2", "usa4"].map(seeded))) as [string, string, string];
    await logRounds(db, USER, { courseId: a }, 1);
    await logRounds(db, USER, { courseId: b }, 1);
    await insertPlayed(db, USER, p);
    const after = await deleteCourse(db, USER, p);
    expect(after.unranked).toEqual([]);
    expect(await ranks()).toEqual([[a, 1], [b, 2]]);
    await expect(deleteCourse(db, USER, p)).rejects.toMatchObject({ status: 404, code: ErrorCode.NotOnList });
  });

  it("allows any number of Played courses per member", async () => {
    const ids = await Promise.all(["usa1", "usa2", "usa3"].map(seeded));
    for (const id of ids) await insertPlayed(db, USER, id);
    expect(await unrankedIds()).toHaveLength(3);
    expect(await rankNumbers(db, USER)).toEqual([]);
  });

  it("keeps ranks contiguous when Played courses are ranked and Ranked ones move at the same time", async () => {
    const [a, b, p, q] = (await Promise.all(["usa1", "usa2", "usa3", "usa4"].map(seeded))) as [string, string, string, string];
    await logRounds(db, USER, { courseId: a }, 1);
    await logRounds(db, USER, { courseId: b }, 1);
    await insertPlayed(db, USER, p);
    await insertPlayed(db, USER, q);
    await Promise.all([moveCourse(db, USER, p, 1), moveCourse(db, USER, q, 2), moveCourse(db, USER, b, 1), deleteCourse(db, USER, a)]);
    expect(await rankNumbers(db, USER)).toEqual([1, 2, 3]);
    expect(await unrankedIds()).toEqual([]);
  });
});

describe("when a course was ranked (ranked_at, for #54)", () => {
  const OLD = new Date("2026-01-01T00:00:00Z");
  /** Each course's ranked_at, with every existing one first set to a known old time. */
  const rankedAt = async (courseId: string) => {
    const [row] = await db
      .select({ rankedAt: userCourses.rankedAt })
      .from(userCourses)
      .where(and(eq(userCourses.userId, USER), eq(userCourses.courseId, courseId)));
    return row?.rankedAt ?? null;
  };
  const backdate = () => db.update(userCourses).set({ rankedAt: OLD }).where(eq(userCourses.userId, USER));
  const isNew = (value: Date | null) => value !== null && value.getTime() > OLD.getTime();

  it("is set when a member moves a course, and not on the courses the move shifts", async () => {
    const [a, b, c] = (await Promise.all(["usa1", "usa2", "usa3"].map(seeded))) as [string, string, string];
    for (const id of [a, b, c]) await logRounds(db, USER, { courseId: id }, 1);
    await backdate();
    await moveCourse(db, USER, c, 1);
    expect(isNew(await rankedAt(c))).toBe(true);
    expect([await rankedAt(a), await rankedAt(b)]).toEqual([OLD, OLD]);
  });

  it("is set when a Played course is placed into the ranking, and stays empty while it is Played", async () => {
    const [a, b, p] = (await Promise.all(["usa1", "usa2", "usa4"].map(seeded))) as [string, string, string];
    await logRounds(db, USER, { courseId: a }, 1);
    await logRounds(db, USER, { courseId: b }, 1);
    await insertPlayed(db, USER, p);
    await moveCourse(db, USER, b, 1);
    expect(await rankedAt(p)).toBeNull();
    await backdate();
    await db.update(userCourses).set({ rankedAt: null }).where(eq(userCourses.courseId, p));
    await moveCourse(db, USER, p, 1);
    expect(isNew(await rankedAt(p))).toBe(true);
    expect([await rankedAt(a), await rankedAt(b)]).toEqual([OLD, OLD]);
  });

  it("is set when an older operation puts a course in the ranking, and left alone when it is already Ranked", async () => {
    const [a, b] = (await Promise.all(["usa1", "usa2"].map(seeded))) as [string, string];
    await logRounds(db, USER, { courseId: a }, 1);
    expect(await rankedAt(a)).not.toBeNull();
    await backdate();
    await logRounds(db, USER, { courseId: a }, 1);
    await addToList(db, USER, a);
    expect(await rankedAt(a)).toEqual(OLD);
    const custom = await addCourseByDetails(db, USER, { ...blob("Ranked At Links", "Hometown, OH, USA", { state: "OH", country: "USA" }), isCustom: true }, { rank: 1, quantity: 1 });
    expect(isNew(await rankedAt(custom.courseId))).toBe(true);
    expect(await rankedAt(a)).toEqual(OLD);
    await addToList(db, USER, b);
    expect(isNew(await rankedAt(b))).toBe(true);
  });

  it("is left alone by count changes, round deletions and removing another course", async () => {
    const [a, b] = (await Promise.all(["usa1", "usa2"].map(seeded))) as [string, string];
    await logRounds(db, USER, { courseId: a }, 2);
    await logRounds(db, USER, { courseId: b }, 1);
    await backdate();
    await setCount(db, USER, a, 3);
    const [round] = await roundHistory(db, USER, a);
    await deleteRound(db, USER, round?.id ?? "");
    await deleteCourse(db, USER, b);
    expect(await rankedAt(a)).toEqual(OLD);
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
    // Hold a lock that adding the course needs after it inserts it, so a
    // snapshot can load between the insert and the commit.
    const blocker = await pool.connect();
    try {
      await blocker.query("begin");
      await blocker.query("select 1 from user_courses where user_id = $1 for update", [USER]);
      const creating = addCustom(blob("Race Condition Links", "Hometown, OH"), null);
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

describe("adding for API clients", () => {
  it("adds a catalog course with one round, and adding again changes nothing", async () => {
    const a = await seeded("usa1");
    const first = await addToList(db, USER, a, "2026-06-01");
    expect(first.added).toBe(true);
    expect(first.courses).toMatchObject([{ rank: 1, played: 1 }]);
    expect((await roundHistory(db, USER, a)).map((row) => row.playedAt)).toEqual(["2026-06-01"]);
    const again = await addToList(db, USER, a);
    expect(again.added).toBe(false);
    expect(again.courses).toMatchObject([{ rank: 1, played: 1 }]);
  });

  it("appends at the bottom and leaves a listed course with rounds unchanged", async () => {
    const a = await seeded("usa1");
    await logRounds(db, USER, { courseId: a }, 2);
    expect((await addToList(db, USER, a)).added).toBe(false);
    expect((await roundsFor(a)).filter((row) => row.userId === USER)).toHaveLength(2);
    const b = await seeded("usa2");
    expect((await addToList(db, USER, b)).added).toBe(true);
    expect(await ranks()).toEqual([[a, 1], [b, 2]]);
  });

  it("logs a round for a listed course that has none", async () => {
    const a = await seeded("usa1");
    // Imported memberships can exist without rounds.
    await db.insert(userCourses).values({ userId: USER, courseId: a, personalRank: 1 });
    const result = await addToList(db, USER, a);
    expect(result).toMatchObject({ added: false, courses: [{ played: 1 }] });
  });

  it("adds a course by details at a requested rank with several rounds on a date", async () => {
    const ids = await Promise.all(["usa1", "usa2"].map(seeded));
    for (const id of ids) await logRounds(db, USER, { courseId: id }, 1);
    const result = await addCourseByDetails(
      db,
      USER,
      { ...blob("Brand New Links", "Hometown, OH, USA", { city: "Hometown", state: "OH", country: "USA" }), isCustom: true },
      { rank: 1, quantity: 3, playedOn: "2026-06-02" },
    );
    expect(result.rank).toBe(1);
    expect(result.courses.map((entry) => [entry.course.name, entry.rank, entry.played])).toEqual([
      ["Brand New Links", 1, 3],
      [expect.any(String), 2, 1],
      [expect.any(String), 3, 1],
    ]);
    expect(new Set((await roundHistory(db, USER, result.courseId)).map((row) => row.playedAt))).toEqual(new Set(["2026-06-02"]));
  });

  it("keeps an existing membership's rank when adding by details again", async () => {
    const details = { ...blob("Brand New Links", "Hometown, OH, USA", { city: "Hometown", state: "OH", country: "USA" }), isCustom: true };
    await logRounds(db, USER, { courseId: await seeded("usa1") }, 1);
    const first = await addCourseByDetails(db, USER, details, { rank: null, quantity: 1 });
    expect(first.rank).toBe(2);
    const second = await addCourseByDetails(db, USER, details, { rank: 1, quantity: 1 });
    expect(second).toMatchObject({ courseId: first.courseId, rank: 2 });
    expect(second.courses.find((entry) => entry.course.id === first.courseId)?.played).toBe(2);
  });
});
