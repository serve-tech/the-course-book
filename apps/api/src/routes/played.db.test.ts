import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  CoursePageSchema,
  MemberListSchema,
  MyCoursesSchema,
  ProfileSchema,
  PublicRankingSchema,
  TimelineSchema,
  TopListDetailSchema,
} from "../contract/schemas";
import { courses, friendships, rounds, userCourses, users } from "../db/schema";
import { FriendshipStatus } from "../domain/friendship";
import { invalidateCatalog } from "../services/catalog";
import { logRounds } from "../services/journal";
import { createTestApp } from "../test/app";
import { insertPlayed, resetMemberData, testDatabase } from "../test/db";

/**
 * Played courses (#52) through the API: a course on a member's list without
 * a rank. Every read that predates them keeps `courses` to the ranking, so
 * old clients never meet a missing rank; the new `unranked` fields carry
 * the rest, and the public ranking never shows a Played course.
 */

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
  invalidateCatalog();
});

const seeded = async (stableId: string) => {
  const [row] = await db.select({ id: courses.id }).from(courses).where(eq(courses.stableId, stableId));
  if (!row) throw new Error("missing " + stableId);
  return row.id;
};

/**
 * golfer_1 (the viewer) and their friend Bravo. Bravo ranks Pine Valley and
 * Augusta and has Shinnecock and Merion Played; the viewer ranks Shinnecock
 * and has Merion Played.
 */
async function scenario() {
  const t = createTestApp(db);
  const auth = t.bearer("user_1", "golfer_1");
  expect((await t.get("/v1/me", auth)).status).toBe(200);
  await db.insert(users).values({ id: "user_2", username: "Bravo", displayName: "Bravo Name" });
  await db.insert(friendships).values({ requesterId: "user_1", addresseeId: "user_2", status: FriendshipStatus.Accepted });
  const [pine, augusta, shinnecock, merion] = [await seeded("usa1"), await seeded("usa2"), await seeded("usa4"), await seeded("usa6")];
  await logRounds(db, "user_2", { courseId: pine }, 1, "2026-06-01");
  await logRounds(db, "user_2", { courseId: augusta }, 1, "2026-06-02");
  await insertPlayed(db, "user_2", shinnecock);
  await insertPlayed(db, "user_2", merion);
  await db.update(userCourses).set({ updatedAt: new Date("2026-10-01T00:00:00Z") }).where(eq(userCourses.courseId, shinnecock));
  await db.update(userCourses).set({ updatedAt: new Date("2026-11-01T00:00:00Z") }).where(eq(userCourses.courseId, merion));
  await logRounds(db, "user_1", { courseId: shinnecock }, 1);
  await insertPlayed(db, "user_1", merion);
  return { t, auth, pine, augusta, shinnecock, merion };
}

describe("reading a list with Played courses", () => {
  it("keeps listMyCourses' courses to the ranking and lists Played courses in unranked", async () => {
    const { t, shinnecock, merion } = await scenario();
    const body = MyCoursesSchema.parse((await t.get("/v1/me/courses", t.bearer("user_2", "Bravo"))).body);
    expect(body.courses.map((entry) => entry.rank)).toEqual([1, 2]);
    expect(body.unranked.map((entry) => [entry.course.id, entry.played])).toEqual([
      [merion, 0],
      [shinnecock, 0],
    ]);
  });

  it("gives a friend's Played courses in unranked, with the viewer's standing on each", async () => {
    const { t, auth, pine, augusta, shinnecock, merion } = await scenario();
    const body = MemberListSchema.parse((await t.get("/v1/members/bravo", auth)).body);
    expect(body.courses.map((row) => [row.course.id, row.rank, row.onMyList, row.myRank])).toEqual([
      [pine, 1, false, null],
      [augusta, 2, false, null],
    ]);
    expect(body.unranked.map((row) => [row.course.id, row.onMyList, row.myRank, row.played])).toEqual([
      [merion, true, null, 0],
      [shinnecock, true, 1, 0],
    ]);
  });

  it("never shows a Played course on the public ranking", async () => {
    const { t, pine, augusta, shinnecock, merion } = await scenario();
    const result = await t.get("/v1/members/Bravo/ranking");
    expect(PublicRankingSchema.parse(result.body).courses.map((row) => [row.course.id, row.rank])).toEqual([
      [pine, 1],
      [augusta, 2],
    ]);
    const text = JSON.stringify(result.body);
    for (const hidden of [shinnecock, merion]) expect(text).not.toContain(hidden);
  });

  it("counts Played courses as courses on a profile, but features only Ranked ones", async () => {
    const { t, auth, pine, augusta } = await scenario();
    const profile = ProfileSchema.parse((await t.get("/v1/members/Bravo/profile", auth)).body);
    expect(profile.stats.courses).toBe(4);
    expect(profile.topFour.map((row) => [row.course.id, row.rank])).toEqual([
      [pine, 1],
      [augusta, 2],
    ]);
    expect(profile.comparison.inCommon).toBe(0);
  });

  it("reports a round at a Played course with a null personalRank and a rank below the ranking", async () => {
    const { t, auth, merion } = await scenario();
    await db.insert(rounds).values({ userId: "user_2", courseId: merion, playedAt: "2026-07-01" });
    const timeline = TimelineSchema.parse((await t.get("/v1/members/Bravo/rounds", auth)).body);
    const atMerion = timeline.rounds.find((round) => round.course.id === merion);
    expect(atMerion).toMatchObject({ personalRank: null, rank: 3 });
    expect(timeline.rounds.filter((round) => round.course.id !== merion).map((round) => [round.rank, round.personalRank])).toEqual([
      [2, 2],
      [1, 1],
    ]);
  });

  it("shows on a course's page whether it is on the viewer's list, and which friends have it Played", async () => {
    const { t, auth, merion, shinnecock } = await scenario();
    const page = CoursePageSchema.parse((await t.get(`/v1/courses/${merion}`, auth)).body);
    expect(page.you).toEqual({ rank: null, outOf: 1, onMyList: true, wantToPlay: false });
    expect(page.friendsRanked).toEqual([]);
    expect(page.friendsUnranked).toEqual([{ username: "Bravo", displayName: "Bravo Name" }]);
    const ranked = CoursePageSchema.parse((await t.get(`/v1/courses/${shinnecock}`, auth)).body);
    expect(ranked.you).toEqual({ rank: 1, outOf: 1, onMyList: true, wantToPlay: false });
  });

  it("ticks a Played course with no rounds on a Top list and counts it as played", async () => {
    const { t, auth, merion, shinnecock } = await scenario();
    const detail = TopListDetailSchema.parse((await t.get("/v1/top-lists/usa/usa", auth)).body);
    const byId = new Map(detail.entries.map((entry) => [entry.course.id, entry]));
    expect(byId.get(merion)).toMatchObject({ played: 0, onMyList: true, friendsPlayed: [{ username: "Bravo" }] });
    expect(byId.get(shinnecock)).toMatchObject({ played: 1, onMyList: true });
    expect(detail.entries.filter((entry) => entry.onMyList)).toHaveLength(2);
    expect(detail.progress).toMatchObject({ mine: 2, friends: [{ played: 4 }] });
  });
});
