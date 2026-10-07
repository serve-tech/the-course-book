import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ApiErrorSchema, FeedSchema, ProfileSchema, TimelineSchema } from "../contract/schemas";
import { courses, friendships, rounds, userCourses, users } from "../db/schema";
import { encodeCursor } from "../domain/cursor";
import { FriendshipStatus } from "../domain/friendship";
import { createTestApp } from "../test/app";
import { resetMemberData, testDatabase } from "../test/db";

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
  await db.insert(users).values([
    { id: "user_1", username: "golfer_1", displayName: "Golfer One", email: "one@example.com" },
    { id: "user_2", username: "Bravo", displayName: "Bravo Name", email: "two@example.com" },
    { id: "user_3", username: "stranger", displayName: "Stranger" },
  ]);
  await db.insert(friendships).values({ requesterId: "user_1", addresseeId: "user_2", status: FriendshipStatus.Accepted });
  const picked = await db.select({ id: courses.id, stableId: courses.stableId }).from(courses).where(eq(courses.isCustom, false)).limit(3);
  await db.insert(userCourses).values(picked.map((course, index) => ({ userId: "user_2", courseId: course.id, personalRank: index + 1 })));
  await db.insert(rounds).values(
    picked.map((course, index) => {
      const day = `2026-09-0${String(index + 1)}`;
      // Logged the evening they were played, so the feed shows each on its own (no backfill).
      return { userId: "user_2", courseId: course.id, playedAt: day, createdAt: new Date(day + "T18:00:00Z") };
    }),
  );
});

const errorCode = (body: unknown) => ApiErrorSchema.parse(body).error.code;

describe("GET /v1/members/{username}/profile", () => {
  it("returns a friend's profile in the contract shape, without member ids", async () => {
    const t = createTestApp(db);
    const result = await t.get("/v1/members/bravo/profile", t.bearer("user_1", "golfer_1"));
    expect(result.status).toBe(200);
    const profile = ProfileSchema.parse(result.body);
    expect(profile).toMatchObject({
      member: { username: "Bravo", displayName: "Bravo Name" },
      relationship: "friends",
      stats: { courses: 3, rounds: 3, friends: 1 },
      comparison: { inCommon: 0, agreement: null, biggestSplits: [] },
    });
    expect(profile.topFour.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(JSON.stringify(result.body)).not.toMatch(/user_\d|@example\.com/);
  });

  it("answers member_not_found for someone who is not a friend", async () => {
    const t = createTestApp(db);
    const result = await t.get("/v1/members/stranger/profile", t.bearer("user_1", "golfer_1"));
    expect(result.status).toBe(404);
    expect(errorCode(result.body)).toBe("member_not_found");
  });

  it("gives the viewer's own profile an empty comparison, never a null object", async () => {
    const t = createTestApp(db);
    const profile = ProfileSchema.parse((await t.get("/v1/members/bravo/profile", t.bearer("user_2", "Bravo"))).body);
    expect(profile.relationship).toBe("self");
    expect(profile.comparison).toEqual({ inCommon: null, agreement: null, biggestSplits: [] });
  });

  it("requires a session", async () => {
    const t = createTestApp(db);
    expect((await t.get("/v1/members/bravo/profile")).status).toBe(401);
  });
});

describe("GET /v1/members/{username}/rounds", () => {
  it("pages through a friend's timeline with nextCursor", async () => {
    const t = createTestApp(db);
    const auth = t.bearer("user_1", "golfer_1");
    const first = TimelineSchema.parse((await t.get("/v1/members/bravo/rounds?limit=2", auth)).body);
    expect(first.rounds.map((round) => round.playedOn)).toEqual(["2026-09-03", "2026-09-02"]);
    expect(first.nextCursor).not.toBeNull();
    const second = TimelineSchema.parse(
      (await t.get(`/v1/members/bravo/rounds?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? "")}`, auth)).body,
    );
    expect(second.rounds.map((round) => round.playedOn)).toEqual(["2026-09-01"]);
    expect(second.nextCursor).toBeNull();
  });

  it("gives September's full count on both pages it is split across", async () => {
    const t = createTestApp(db);
    const auth = t.bearer("user_1", "golfer_1");
    const first = TimelineSchema.parse((await t.get("/v1/members/bravo/rounds?limit=2", auth)).body);
    expect(first.months).toEqual([{ month: "2026-09", rounds: 3 }]);
    const second = TimelineSchema.parse(
      (await t.get(`/v1/members/bravo/rounds?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? "")}`, auth)).body,
    );
    expect(second.months).toEqual([{ month: "2026-09", rounds: 3 }]);
  });

  it.each([
    ["a tampered cursor", "cursor=" + encodeCursor({ at: "yesterday" })],
    ["garbage", "cursor=%%%"],
    ["a zero limit", "limit=0"],
    ["a limit over 100", "limit=101"],
  ])("rejects %s with validation_failed", async (_label, query) => {
    const t = createTestApp(db);
    const result = await t.get(`/v1/members/bravo/rounds?${query}`, t.bearer("user_1", "golfer_1"));
    expect(result.status).toBe(400);
    expect(errorCode(result.body)).toBe("validation_failed");
  });
});

describe("GET /v1/feed", () => {
  it("returns friends' rounds in the contract shape", async () => {
    const t = createTestApp(db);
    const result = await t.get("/v1/feed", t.bearer("user_1", "golfer_1"));
    expect(result.status).toBe(200);
    const feed = FeedSchema.parse(result.body);
    expect(feed.items.map((item) => [item.type, item.member.username, item.rounds[0]?.playedOn])).toEqual([
      ["round", "Bravo", "2026-09-03"],
      ["round", "Bravo", "2026-09-02"],
      ["round", "Bravo", "2026-09-01"],
    ]);
    expect(feed.nextCursor).toBeNull();
    expect(JSON.stringify(result.body)).not.toMatch(/user_\d|@example\.com/);
  });

  it("is empty for a member with no friends", async () => {
    const t = createTestApp(db);
    const feed = FeedSchema.parse((await t.get("/v1/feed", t.bearer("user_3", "stranger"))).body);
    expect(feed).toEqual({ items: [], nextCursor: null });
  });

  it("rejects a cursor from another page type", async () => {
    const t = createTestApp(db);
    const timelineCursor = encodeCursor({ undated: false, playedOn: "2026-09-01", createdAt: "2026-09-01T12:00:00.000000Z", id: "aaaaaaaa-0000-4000-8000-000000000001" });
    const result = await t.get(`/v1/feed?cursor=${timelineCursor}`, t.bearer("user_1", "golfer_1"));
    expect(result.status).toBe(400);
  });
});
