import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ApiErrorSchema, TopListDetailSchema, TopListsSchema } from "../contract/schemas";
import { courses, friendships, rounds, userCourses, users } from "../db/schema";
import { FriendshipStatus } from "../domain/friendship";
import { invalidateCatalog } from "../services/catalog";
import { createTestApp } from "../test/app";
import { resetMemberData, testDatabase } from "../test/db";

/** Top lists with the member's and friends' progress (issue #17), through the real app. */

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

/** Put catalog courses on a member's list, one round each. */
async function played(userId: string, courseIds: readonly string[]) {
  await db.insert(userCourses).values(courseIds.map((courseId, index) => ({ userId, courseId, personalRank: index + 1 })));
  await db.insert(rounds).values(courseIds.map((courseId) => ({ userId, courseId, playedAt: "2026-06-01" })));
}

/** golfer_1 signed in; Priya (a friend), Pending Pat (a request) and Gone Gil (a deleted friend) exist. */
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
  const [pine, augusta, shinnecock] = [await seeded("usa1"), await seeded("usa2"), await seeded("usa4")];
  await played("user_1", [pine]);
  await played("user_priya", [pine, augusta]);
  await played("user_pat", [pine, augusta, shinnecock]);
  await played("user_gil", [shinnecock]);
  return { t, auth, pine, augusta, shinnecock };
}

describe("listTopLists", () => {
  it("returns every list with your progress and your friends' only", async () => {
    const { t, auth } = await scenario();
    const { lists } = TopListsSchema.parse((await t.get("/v1/top-lists", auth)).body);
    expect(lists.slice(0, 4).map((entry) => entry.list.title)).toEqual(["World Top 100", "USA Top 100", "USA Public Top 100", "International Top 100"]);
    const usa = lists.find((entry) => entry.list.type === "usa");
    expect(usa).toMatchObject({ list: { size: 100, source: "Golf Digest" }, mine: 1, friends: [{ member: { username: "priya" }, played: 2 }] });
  });

  it("rejects anonymous requests", async () => {
    expect((await createTestApp(db).get("/v1/top-lists")).status).toBe(401);
  });
});

describe("getTopList", () => {
  it("returns the list in rank order with your rounds, Want to play and the friends who played each course", async () => {
    const { t, auth, pine, augusta, shinnecock } = await scenario();
    await t.send("PUT", `/v1/me/want-to-play/${augusta}`, undefined, auth);
    const detail = TopListDetailSchema.parse((await t.get("/v1/top-lists/usa/usa", auth)).body);
    expect(detail.entries.map((entry) => entry.rank).slice(0, 4)).toEqual([1, 2, 3, 4]);
    const byId = new Map(detail.entries.map((entry) => [entry.course.id, entry]));
    expect(byId.get(pine)).toMatchObject({ played: 1, wantToPlay: false, friendsPlayed: [{ username: "priya" }] });
    expect(byId.get(augusta)).toMatchObject({ played: 0, wantToPlay: true, friendsPlayed: [{ username: "priya" }] });
    expect(byId.get(shinnecock)).toMatchObject({ played: 0, friendsPlayed: [] });
    expect(detail.progress).toMatchObject({ mine: 1, friends: [{ played: 2 }] });
  });

  it("answers top_list_not_found for a list that does not exist", async () => {
    const { t, auth } = await scenario();
    const result = await t.get("/v1/top-lists/state/ZZ", auth);
    expect(result.status).toBe(404);
    expect(ApiErrorSchema.parse(result.body).error.code).toBe("top_list_not_found");
  });
});
