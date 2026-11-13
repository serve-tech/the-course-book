import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ApiErrorSchema, CoursePageSchema } from "../contract/schemas";
import { courses, friendships, rounds, userCourses, users, wantToPlay } from "../db/schema";
import { FriendshipStatus } from "../domain/friendship";
import { invalidateCatalog } from "../services/catalog";
import { createTestApp } from "../test/app";
import { resetMemberData, testDatabase } from "../test/db";

/** A course's page (decision 2026-11-13), through the real app. */

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

/** Put catalog courses on a member's ranking in this order, one round each. */
async function ranked(userId: string, courseIds: readonly string[]) {
  await db.insert(userCourses).values(courseIds.map((courseId, index) => ({ userId, courseId, personalRank: index + 1 })));
  await db.insert(rounds).values(courseIds.map((courseId) => ({ userId, courseId, playedAt: "2026-06-01" })));
}

/** golfer_1 signed in; Priya (a friend), Pending Pat (a request) and Gone Gil (a deleted friend) all rank Pine Valley. */
async function scenario() {
  const t = createTestApp(db);
  const auth = t.bearer("user_1", "golfer_1");
  expect((await t.get("/v1/me", auth)).status).toBe(200);
  await db.insert(users).values([
    { id: "user_priya", username: "priya", displayName: "Priya" },
    { id: "user_pat", username: "pat", displayName: "Pending Pat" },
    { id: "user_gil", username: "gil", displayName: "Gone Gil", deletedAt: new Date() },
  ]);
  await db.insert(friendships).values([
    { requesterId: "user_1", addresseeId: "user_priya", status: FriendshipStatus.Accepted },
    { requesterId: "user_pat", addresseeId: "user_1", status: FriendshipStatus.Pending },
    { requesterId: "user_1", addresseeId: "user_gil", status: FriendshipStatus.Accepted },
  ]);
  const [pine, augusta] = [await seeded("usa1"), await seeded("usa2")];
  await ranked("user_1", [pine]);
  await ranked("user_priya", [augusta, pine]);
  await ranked("user_pat", [pine]);
  await ranked("user_gil", [pine]);
  await db.insert(wantToPlay).values([
    { userId: "user_priya", courseId: augusta },
    { userId: "user_pat", courseId: augusta },
  ]);
  return { t, auth, pine, augusta };
}

describe("getCourse", () => {
  it("returns the course with your rank and your friends' ranks only", async () => {
    const { t, auth, pine } = await scenario();
    const page = CoursePageSchema.parse((await t.get(`/v1/courses/${pine}`, auth)).body);
    expect(page.course).toMatchObject({ id: pine, name: "Pine Valley Golf Club", ranks: { usa: 1 } });
    expect(page.you).toEqual({ rank: 1, outOf: 1, wantToPlay: false });
    expect(page.friendsRanked).toEqual([{ member: { username: "priya", displayName: "Priya" }, rank: 2, outOf: 2 }]);
    expect(page.friendsWantToPlay).toEqual([]);
  });

  it("shows Want to play, yours and your friends', for a course you haven't ranked", async () => {
    const { t, auth, augusta } = await scenario();
    expect((await t.send("PUT", `/v1/me/want-to-play/${augusta}`, undefined, auth)).status).toBe(200);
    const page = CoursePageSchema.parse((await t.get(`/v1/courses/${augusta}`, auth)).body);
    expect(page.you).toEqual({ rank: null, outOf: 1, wantToPlay: true });
    expect(page.friendsRanked).toEqual([{ member: { username: "priya", displayName: "Priya" }, rank: 1, outOf: 2 }]);
    expect(page.friendsWantToPlay).toEqual([{ username: "priya", displayName: "Priya" }]);
  });

  it.each([
    { name: "an unknown course", path: "/v1/courses/00000000-0000-4000-8000-000000000000", status: 404, code: "course_not_found" },
    { name: "a malformed id", path: "/v1/courses/not-a-uuid", status: 400, code: "validation_failed" },
  ])("rejects $name", async ({ path, status, code }) => {
    const { t, auth } = await scenario();
    const response = await t.get(path, auth);
    expect(response.status).toBe(status);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe(code);
  });

  it("rejects anonymous requests", async () => {
    const { pine } = await scenario();
    expect((await createTestApp(db).get(`/v1/courses/${pine}`)).status).toBe(401);
  });
});
