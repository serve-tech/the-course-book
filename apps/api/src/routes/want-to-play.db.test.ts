import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ApiErrorSchema, WantToPlaySchema } from "../contract/schemas";
import { courses, friendships, users } from "../db/schema";
import { FriendshipStatus } from "../domain/friendship";
import { invalidateCatalog } from "../services/catalog";
import { createTestApp } from "../test/app";
import { resetMemberData, testDatabase } from "../test/db";

/** Want to play operations against the test database, through the real app and token verification. */

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

/** A test app with golfer_1 (user_1) provisioned. */
async function signedIn() {
  const t = createTestApp(db);
  const auth = t.bearer("user_1", "golfer_1");
  expect((await t.get("/v1/me", auth)).status).toBe(200);
  return { t, auth };
}

const wanted = (body: unknown) => WantToPlaySchema.parse(body).courses.map((entry) => entry.course.id);

describe("changing your Want to play list", () => {
  it("rejects anonymous requests", async () => {
    const t = createTestApp(db);
    expect((await t.send("PUT", `/v1/me/want-to-play/${await seeded("usa1")}`, undefined)).status).toBe(401);
  });

  it("adds newest first, keeps the first date when added again, and removes idempotently", async () => {
    const { t, auth } = await signedIn();
    const [pine, augusta] = [await seeded("usa1"), await seeded("usa2")];
    const first = WantToPlaySchema.parse((await t.send("PUT", `/v1/me/want-to-play/${pine}`, undefined, auth)).body);
    expect(wanted((await t.send("PUT", `/v1/me/want-to-play/${augusta}`, undefined, auth)).body)).toEqual([augusta, pine]);
    const again = WantToPlaySchema.parse((await t.send("PUT", `/v1/me/want-to-play/${pine}`, undefined, auth)).body);
    expect(again.courses.find((entry) => entry.course.id === pine)?.addedAt).toBe(first.courses[0]?.addedAt);

    expect(wanted((await t.send("DELETE", `/v1/me/want-to-play/${pine}`, undefined, auth)).body)).toEqual([augusta]);
    const retried = await t.send("DELETE", `/v1/me/want-to-play/${pine}`, undefined, auth);
    expect(retried.status).toBe(200);
    expect(wanted(retried.body)).toEqual([augusta]);
  });

  it("answers course_not_found for an unknown course", async () => {
    const { t, auth } = await signedIn();
    const result = await t.send("PUT", "/v1/me/want-to-play/00000000-0000-4000-8000-000000000000", undefined, auth);
    expect(result.status).toBe(404);
    expect(ApiErrorSchema.parse(result.body).error.code).toBe("course_not_found");
  });

  it("keeps a played course until a round is logged there", async () => {
    const { t, auth } = await signedIn();
    const [played, other] = [await seeded("usa1"), await seeded("usa2")];
    await t.send("POST", `/v1/me/courses/${played}/rounds`, { playedOn: "2026-05-01" }, auth);
    await t.send("PUT", `/v1/me/want-to-play/${played}`, undefined, auth);
    await t.send("PUT", `/v1/me/want-to-play/${other}`, undefined, auth);

    await t.send("POST", `/v1/me/courses/${played}/rounds`, { playedOn: "2026-06-01" }, auth);
    expect(wanted((await t.get("/v1/members/golfer_1/want-to-play", auth)).body)).toEqual([other]);
  });
});

describe("reading a Want to play list", () => {
  async function withFriend(status: FriendshipStatus) {
    const { t, auth } = await signedIn();
    const friendAuth = t.bearer("user_2", "golfer_2");
    expect((await t.get("/v1/me", friendAuth)).status).toBe(200);
    await t.send("PUT", `/v1/me/want-to-play/${await seeded("usa1")}`, undefined, friendAuth);
    await db.insert(friendships).values({ requesterId: "user_1", addresseeId: "user_2", status });
    return { t, auth };
  }

  it("shows an accepted friend's list", async () => {
    const { t, auth } = await withFriend(FriendshipStatus.Accepted);
    expect(wanted((await t.get("/v1/members/golfer_2/want-to-play", auth)).body)).toEqual([await seeded("usa1")]);
  });

  it("hides the list while the friend request is pending", async () => {
    const { t, auth } = await withFriend(FriendshipStatus.Pending);
    const result = await t.get("/v1/members/golfer_2/want-to-play", auth);
    expect(result.status).toBe(404);
    expect(ApiErrorSchema.parse(result.body).error.code).toBe("member_not_found");
  });

  it("hides a stranger's list and an unknown member's", async () => {
    const { t, auth } = await signedIn();
    await db.insert(users).values({ id: "user_3", username: "stranger", displayName: "Stranger" });
    expect((await t.get("/v1/members/stranger/want-to-play", auth)).status).toBe(404);
    expect((await t.get("/v1/members/nobody/want-to-play", auth)).status).toBe(404);
  });
});
