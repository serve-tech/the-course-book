import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  AddedCourseSchema,
  AddedPlayedCourseSchema,
  AddedToListSchema,
  ApiErrorSchema,
  CoursePageSchema,
  DeletedRoundSchema,
  FeedSchema,
  LoggedRoundsSchema,
  MemberListSchema,
  MovedCourseSchema,
  MyCoursesSchema,
  PlayCountSchema,
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

const errorCode = (body: unknown) => ApiErrorSchema.parse(body).error.code;

describe("PUT /v1/me/played-courses/{courseId} (markPlayed)", () => {
  it("adds a catalog course unranked with no round, and changes nothing the second time", async () => {
    const { t, auth, pine, merion } = await scenario();
    const first = AddedToListSchema.parse((await t.send("PUT", `/v1/me/played-courses/${pine}`, undefined, auth)).body);
    expect(first.added).toBe(true);
    expect(first.unranked.map((entry) => [entry.course.id, entry.played])).toEqual([
      [pine, 0],
      [merion, 0],
    ]);
    expect(first.courses.map((entry) => entry.rank)).toEqual([1]);
    const again = AddedToListSchema.parse((await t.send("PUT", `/v1/me/played-courses/${pine}`, undefined, auth)).body);
    expect(again).toMatchObject({ added: false, unranked: first.unranked, courses: first.courses });
    expect(await db.select().from(rounds).where(eq(rounds.courseId, pine))).toHaveLength(1);
  });

  it("answers course_not_found for an unknown course and rejects a malformed id", async () => {
    const { t, auth } = await scenario();
    const unknown = await t.send("PUT", "/v1/me/played-courses/00000000-0000-4000-8000-000000000000", undefined, auth);
    expect([unknown.status, errorCode(unknown.body)]).toEqual([404, "course_not_found"]);
    expect((await t.send("PUT", "/v1/me/played-courses/not-a-uuid", undefined, auth)).status).toBe(400);
  });
});

describe("POST /v1/me/played-courses (addPlayedCourse)", () => {
  it("adds a course typed in by hand as Played, with no round, once", async () => {
    const { t, auth } = await scenario();
    const body = { source: "manual", course: { name: "Backyard Nine", city: "Hometown", state: "OH", country: "USA" } };
    const result = await t.send("POST", "/v1/me/played-courses", body, auth);
    expect(result.status).toBe(200);
    const added = AddedPlayedCourseSchema.parse(result.body);
    expect(added.added).toBe(true);
    expect(added.unranked[0]).toMatchObject({ played: 0, course: { id: added.courseId, name: "Backyard Nine" } });
    const [row] = await db.select().from(courses).where(eq(courses.id, added.courseId));
    expect(row).toMatchObject({ isCustom: true, createdBy: "user_1" });
    const again = AddedPlayedCourseSchema.parse((await t.send("POST", "/v1/me/played-courses", body, auth)).body);
    expect(again).toMatchObject({ courseId: added.courseId, added: false });
    expect(await db.select().from(rounds).where(eq(rounds.courseId, added.courseId))).toEqual([]);
  });

  it("requires a U.S. state and a name, and accepts null optional fields as Kotlin sends them", async () => {
    const { t, auth } = await scenario();
    const stateless = await t.send("POST", "/v1/me/played-courses", { source: "search", course: { name: "Nowhere Nine", location: "USA", country: "USA" } }, auth);
    expect([stateless.status, errorCode(stateless.body)]).toEqual([400, "us_state_required"]);
    const nameless = await t.send("POST", "/v1/me/played-courses", { source: "manual", course: { name: "", country: "USA" } }, auth);
    expect([nameless.status, errorCode(nameless.body)]).toEqual([400, "validation_failed"]);
    const kotlin = await t.send(
      "POST",
      "/v1/me/played-courses",
      { source: "search", course: { name: "Links Abroad", city: "Dundee", state: null, country: "Scotland", location: null, logoUrl: null, websiteUrl: null } },
      auth,
    );
    expect(kotlin.status).toBe(200);
  });
});

describe("DELETE /v1/me/courses/{courseId}/rank (unrankCourse)", () => {
  it("moves a Ranked course to unranked, keeping its rounds, and is safe to repeat", async () => {
    const { t, auth, shinnecock, merion } = await scenario();
    const result = MyCoursesSchema.parse((await t.send("DELETE", `/v1/me/courses/${shinnecock}/rank`, undefined, auth)).body);
    expect(result.courses).toEqual([]);
    expect(result.unranked.map((entry) => [entry.course.id, entry.played])).toEqual([
      [shinnecock, 1],
      [merion, 0],
    ]);
    const again = MyCoursesSchema.parse((await t.send("DELETE", `/v1/me/courses/${shinnecock}/rank`, undefined, auth)).body);
    expect(again).toEqual(result);
  });

  it("answers not_on_list for a course that is not on the list", async () => {
    const { t, auth, pine } = await scenario();
    const result = await t.send("DELETE", `/v1/me/courses/${pine}/rank`, undefined, auth);
    expect([result.status, errorCode(result.body)]).toEqual([404, "not_on_list"]);
  });

  it("is undone by moving the course back into the ranking", async () => {
    const { t, auth, shinnecock, merion } = await scenario();
    await t.send("DELETE", `/v1/me/courses/${shinnecock}/rank`, undefined, auth);
    const placed = MovedCourseSchema.parse((await t.send("PUT", `/v1/me/courses/${merion}/rank`, { rank: 1 }, auth)).body);
    expect(placed.rank).toBe(1);
    const back = MovedCourseSchema.parse((await t.send("PUT", `/v1/me/courses/${shinnecock}/rank`, { rank: 1 }, auth)).body);
    expect(back.courses.map((entry) => [entry.course.id, entry.rank])).toEqual([
      [shinnecock, 1],
      [merion, 2],
    ]);
    expect(back.unranked).toEqual([]);
  });
});

/**
 * The deploy overlap (design section 1): an installed web bundle, or a
 * native build, from before Played courses reads `courses` and `rank` and
 * nothing else. Once a member has Played courses, every operation those
 * clients call must still answer with integer ranks only (the schemas parse
 * `rank` as an integer of at least 1) and never put a Played course in
 * `courses`; the public ranking must never show one.
 */
describe("older clients, once a member has Played courses", () => {
  it("never get a Played course or a missing rank from the operations they call", async () => {
    const { t, auth, pine, augusta, shinnecock, merion } = await scenario();
    const oakmont = await seeded("usa8");
    expect((await t.send("PUT", `/v1/me/played-courses/${oakmont}`, undefined, auth)).status).toBe(200);
    await db.insert(rounds).values({ userId: "user_2", courseId: merion, playedAt: "2026-07-01" });
    await db.insert(rounds).values({ userId: "user_1", courseId: merion, playedAt: "2026-07-02" });
    const played = new Set([merion, oakmont]);
    const ranked = (rows: readonly { course: { id: string } }[]) => rows.filter((row) => played.has(row.course.id));

    const responses = [
      MyCoursesSchema.parse((await t.get("/v1/me/courses", auth)).body).courses,
      AddedToListSchema.parse((await t.send("PUT", `/v1/me/courses/${pine}`, {}, auth)).body).courses,
      AddedCourseSchema.parse(
        (await t.send("POST", "/v1/me/courses", { source: "manual", course: { name: "Old Client Links", city: "Austin", state: "TX", country: "USA" } }, auth)).body,
      ).courses,
      LoggedRoundsSchema.parse((await t.send("POST", `/v1/me/courses/${augusta}/rounds`, { playedOn: "2026-08-01" }, auth)).body).courses,
      MovedCourseSchema.parse((await t.send("PUT", `/v1/me/courses/${augusta}/rank`, { rank: 1 }, auth)).body).courses,
      PlayCountSchema.parse((await t.send("PUT", `/v1/me/courses/${shinnecock}/play-count`, { count: 2 }, auth)).body).courses,
    ];
    const [round] = await db.select({ id: rounds.id }).from(rounds).where(eq(rounds.courseId, augusta));
    responses.push(DeletedRoundSchema.parse((await t.send("DELETE", `/v1/me/rounds/${round?.id ?? ""}`, undefined, auth)).body).courses);
    responses.push(MyCoursesSchema.parse((await t.send("DELETE", `/v1/me/courses/${pine}`, undefined, auth)).body).courses);
    for (const courses of responses) {
      expect(ranked(courses)).toEqual([]);
      expect(courses.map((entry) => entry.rank)).toEqual(courses.map((_, index) => index + 1));
    }

    expect(ranked(MemberListSchema.parse((await t.get("/v1/members/golfer_1", auth)).body).courses)).toEqual([]);
    expect(ranked(ProfileSchema.parse((await t.get("/v1/members/golfer_1/profile", auth)).body).topFour)).toEqual([]);
    expect(ranked(PublicRankingSchema.parse((await t.get("/v1/members/golfer_1/ranking")).body).courses)).toEqual([]);
    expect(ranked(PublicRankingSchema.parse((await t.get("/v1/members/Bravo/ranking")).body).courses)).toEqual([]);
    // Rounds at Played courses still appear, with an integer rank below the ranking.
    const timeline = TimelineSchema.parse((await t.get("/v1/members/golfer_1/rounds", auth)).body);
    expect(timeline.rounds.find((entry) => entry.course.id === merion)).toMatchObject({ personalRank: null });
    const feed = FeedSchema.parse((await t.get("/v1/feed", auth)).body);
    expect(feed.items.flatMap((item) => item.rounds).find((entry) => entry.course.id === merion)).toMatchObject({ personalRank: null, rank: 3 });
    expect(MyCoursesSchema.parse((await t.get("/v1/me/courses", auth)).body).unranked.map((entry) => entry.course.id).sort()).toEqual(
      [merion, oakmont].sort(),
    );
  });
});
