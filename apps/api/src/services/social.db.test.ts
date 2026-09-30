import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FeedItemType, ProfileRelationship } from "@coursebook/domain/social/types";
import { courses, friendships, rounds, userCourses, users } from "../db/schema";
import { FriendshipStatus } from "../domain/friendship";
import { resetMemberData, testDatabase } from "../test/db";
import { BACKFILL_DAYS, BACKFILL_SAMPLE, friendsFeed, type FeedCursor } from "./feed";
import { memberList } from "./friends";
import { memberProfile } from "./profiles";
import { memberTimeline, type TimelineCursor } from "./timeline";

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

/** Seeded catalog course ids by stable id. */
const catalog = new Map<string, string>();

beforeAll(async () => {
  for (const row of await db.select({ id: courses.id, stableId: courses.stableId }).from(courses))
    if (row.stableId) catalog.set(row.stableId, row.id);
});

beforeEach(async () => {
  await resetMemberData(db);
  await db.insert(users).values([
    { id: "user_a", username: "alpha", displayName: "Alpha" },
    { id: "user_b", username: "bravo", displayName: "Bravo" },
    { id: "user_c", username: "charlie", displayName: "Charlie" },
    { id: "user_gone", username: "gone", displayName: "Gone", deletedAt: new Date() },
  ]);
});

const course = (stableId: string) => {
  const id = catalog.get(stableId);
  if (!id) throw new Error("missing seeded course " + stableId);
  return id;
};

const befriend = (a: string, b: string) =>
  db.insert(friendships).values({ requesterId: a, addresseeId: b, status: FriendshipStatus.Accepted });

/** Put courses on a member's list in the given order (ranks 1..N). */
const rank = (userId: string, stableIds: readonly string[]) =>
  db.insert(userCourses).values(stableIds.map((stableId, index) => ({ userId, courseId: course(stableId), personalRank: index + 1 })));

/** Log a round with explicit dates; `createdAt` defaults to the day it was played. */
const round = async (userId: string, stableId: string, playedAt: string, createdAt?: string) => {
  const [row] = await db
    .insert(rounds)
    .values({ userId, courseId: course(stableId), playedAt, createdAt: new Date(createdAt ?? playedAt + "T12:00:00Z") })
    .returning({ id: rounds.id });
  if (!row) throw new Error("round insert returned nothing");
  return row.id;
};

const thisYear = new Date().getUTCFullYear();

describe("memberList", () => {
  it("adds the member's play counts, latest date and the viewer's rank per course", async () => {
    await befriend("user_a", "user_b");
    await rank("user_a", ["usa8", "usa3"]);
    await rank("user_b", ["usa3", "usa1", "usa8"]);
    await round("user_b", "usa3", "2025-05-01");
    await round("user_b", "usa3", "2026-07-04");
    await round("user_b", "usa1", "2024-01-01");
    const list = await memberList(db, "user_a", "bravo");
    expect(list?.rows.map((row) => ({ rank: row.rank, onMyList: row.onMyList, myRank: row.myRank, played: row.played, lastPlayedOn: row.lastPlayedOn }))).toEqual([
      { rank: 1, onMyList: true, myRank: 2, played: 2, lastPlayedOn: "2026-07-04" },
      { rank: 2, onMyList: false, myRank: null, played: 1, lastPlayedOn: "2024-01-01" },
      { rank: 3, onMyList: true, myRank: 1, played: 0, lastPlayedOn: null },
    ]);
  });
});

describe("memberProfile", () => {
  it("shows the viewer their own profile with stats and Top Four, without a comparison", async () => {
    await befriend("user_a", "user_b");
    await befriend("user_c", "user_a");
    await rank("user_a", ["usa8", "usa3", "usa14", "usa5", "usa1"]);
    await round("user_a", "usa8", `${String(thisYear)}-03-01`);
    await round("user_a", "usa3", "2019-06-01");

    const profile = await memberProfile(db, "user_a", "ALPHA");
    expect(profile).toMatchObject({
      member: { username: "alpha", displayName: "Alpha" },
      relationship: ProfileRelationship.Self,
      friendsSince: null,
      stats: { courses: 5, rounds: 2, roundsThisYear: 1, friends: 2 },
      comparison: null,
    });
    expect(profile?.topFour.map((row) => [row.rank, row.myRank])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
  });

  it("compares a friend's ranking with the viewer's", async () => {
    await befriend("user_a", "user_b");
    await rank("user_a", ["usa1", "usa2", "usa3", "usa4"]);
    // usa3 and usa2 swapped, and usa2 pushed to the bottom; usa4 is only mine, usa9 only theirs.
    await rank("user_b", ["usa1", "usa3", "usa9", "usa2"]);

    const profile = await memberProfile(db, "user_a", "bravo");
    expect(profile?.relationship).toBe(ProfileRelationship.Friends);
    expect(profile?.friendsSince).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(profile?.comparison?.inCommon).toBe(3);
    // Pairs (1,3) agree, (1,2) agree, (3,2) disagree.
    expect(profile?.comparison?.agreement).toBeCloseTo(2 / 3);
    // usa2 sits at 2/4 for me and 4/4 for them, the largest gap.
    expect(profile?.comparison?.biggestSplit).toMatchObject({ myRank: 2, theirRank: 4 });
    expect(profile?.comparison?.biggestSplit?.course.id).toBe(course("usa2"));
  });

  it.each([
    ["a member who is not a friend", "charlie"],
    ["a pending request", "bravo"],
    ["a deleted member", "gone"],
    ["an unknown username", "nobody"],
  ])("does not show %s", async (_label, username) => {
    await db.insert(friendships).values({ requesterId: "user_a", addresseeId: "user_b", status: FriendshipStatus.Pending });
    expect(await memberProfile(db, "user_a", username)).toBeNull();
  });
});

describe("memberTimeline", () => {
  it("lists rounds newest played first with visit numbers and ranks", async () => {
    await befriend("user_a", "user_b");
    await rank("user_b", ["usa3", "usa8"]);
    const first = await round("user_b", "usa3", "2024-05-01");
    const sand = await round("user_b", "usa8", "2025-08-15");
    const second = await round("user_b", "usa3", "2026-09-01");

    const page = await memberTimeline(db, "user_a", "bravo", { after: null, limit: 10 });
    expect(page?.rounds.map((r) => [r.id, r.playedOn, r.visit, r.rank])).toEqual([
      [second, "2026-09-01", 2, 1],
      [sand, "2025-08-15", 1, 2],
      [first, "2024-05-01", 1, 1],
    ]);
    expect(page?.next).toBeNull();
  });

  it("pages without skipping or repeating rounds that share a date and a timestamp", async () => {
    await rank("user_a", ["usa1", "usa2", "usa3"]);
    // Five rounds on one date, logged in the same millisecond with distinct microseconds,
    // plus two with the exact same timestamp: only the id orders them.
    const ids = [
      await round("user_a", "usa1", "2026-06-01", "2026-06-01T12:00:00.000001Z"),
      await round("user_a", "usa2", "2026-06-01", "2026-06-01T12:00:00.000002Z"),
      await round("user_a", "usa3", "2026-06-01", "2026-06-01T12:00:00.000003Z"),
      await round("user_a", "usa1", "2026-06-01", "2026-06-01T12:00:00.000009Z"),
      await round("user_a", "usa2", "2026-06-01", "2026-06-01T12:00:00.000009Z"),
      await round("user_a", "usa3", "2026-05-01"),
    ];
    for (const limit of [1, 2, 3, 4, 5, 6]) {
      const seen: string[] = [];
      let after: TimelineCursor | null = null;
      for (let guard = 0; guard < 20; guard++) {
        const page = await memberTimeline(db, "user_a", "alpha", { after, limit });
        if (!page) throw new Error("own timeline missing");
        seen.push(...page.rounds.map((r) => r.id));
        after = page.next;
        if (!after) break;
      }
      expect(new Set(seen).size, `limit ${String(limit)}`).toBe(ids.length);
      expect(seen, `limit ${String(limit)}`).toHaveLength(ids.length);
    }
  });

  it("is not available for someone who is not a friend", async () => {
    expect(await memberTimeline(db, "user_a", "charlie", { after: null, limit: 10 })).toBeNull();
  });
});

describe("friendsFeed", () => {
  const all = async (viewerId: string, limit: number) => {
    const items = [];
    let after: FeedCursor | null = null;
    for (let guard = 0; guard < 50; guard++) {
      const page = await friendsFeed(db, viewerId, { after, limit });
      items.push(...page.items);
      after = page.next;
      if (!after) break;
    }
    return items;
  };

  it("shows friends' rounds newest logged first, and nobody else's", async () => {
    await befriend("user_a", "user_b");
    await db.insert(friendships).values({ requesterId: "user_c", addresseeId: "user_a", status: FriendshipStatus.Pending });
    await rank("user_a", ["usa1"]);
    await rank("user_b", ["usa8", "usa3"]);
    await rank("user_c", ["usa5"]);
    await round("user_a", "usa1", "2026-09-20");
    const older = await round("user_b", "usa3", "2026-09-10");
    const newer = await round("user_b", "usa8", "2026-09-25");
    await round("user_c", "usa5", "2026-09-26");

    const items = await all("user_a", 10);
    expect(items.map((item) => [item.type, item.member.username, item.rounds[0]?.id])).toEqual([
      [FeedItemType.Round, "bravo", newer],
      [FeedItemType.Round, "bravo", older],
    ]);
    expect(items[0]?.rounds).toHaveLength(1);
    expect(items[0]?.rounds[0]).toMatchObject({ playedOn: "2026-09-25", visit: 1, rank: 1 });
    expect(items[0]?.count).toBe(1);
    expect(items[0]?.at).toBe("2026-09-25T12:00:00.000000Z");
  });

  it("collapses rounds logged long after they were played into one item per friend and day", async () => {
    await befriend("user_a", "user_b");
    const old = ["usa1", "usa2", "usa3", "usa4", "usa5", "usa6"];
    await rank("user_b", old);
    // Six old rounds logged on one day; the threshold itself is not backfill.
    const logged = "2026-09-28T10:00:00Z";
    for (const [index, stableId] of old.entries()) await round("user_b", stableId, `2015-0${String(index + 1)}-01`, logged);
    const edge = new Date(Date.parse("2026-09-28T00:00:00Z") - BACKFILL_DAYS * 86_400_000).toISOString().slice(0, 10);
    await db.insert(userCourses).values({ userId: "user_b", courseId: course("usa7"), personalRank: 7 });
    const onTime = await round("user_b", "usa7", edge, "2026-09-28T09:00:00Z");

    const items = await all("user_a", 10);
    expect(items.map((item) => [item.type, item.count])).toEqual([
      [FeedItemType.Backfill, 6],
      [FeedItemType.Round, 1],
    ]);
    expect(items[1]?.rounds[0]?.id).toBe(onTime);
    // Examples are the most recently played rounds, one per course.
    const examples = items[0]?.rounds ?? [];
    expect(examples.map((r) => r.playedOn)).toEqual(["2015-06-01", "2015-05-01", "2015-04-01", "2015-03-01"]);
    expect(examples).toHaveLength(BACKFILL_SAMPLE);
    expect(items[0]?.at).toBe("2026-09-28T10:00:00.000000Z");
  });

  it("pages through mixed items without gaps or repeats", async () => {
    await befriend("user_a", "user_b");
    await befriend("user_c", "user_a");
    await rank("user_b", ["usa1", "usa2", "usa3"]);
    await rank("user_c", ["usa4", "usa5"]);
    await round("user_b", "usa1", "2026-09-01");
    await round("user_b", "usa2", "2026-09-01", "2026-09-01T12:00:00Z");
    await round("user_c", "usa4", "2026-09-01", "2026-09-01T12:00:00Z");
    await round("user_b", "usa3", "2001-01-01", "2026-09-02T08:00:00Z");
    await round("user_c", "usa5", "2002-01-01", "2026-09-02T08:00:00Z");
    const expected = (await all("user_a", 100)).map((item) => item.id);
    expect(expected).toHaveLength(5);
    for (const limit of [1, 2, 3, 4]) expect((await all("user_a", limit)).map((item) => item.id)).toEqual(expected);
  });

  it("leaves out deleted friends", async () => {
    await befriend("user_a", "user_gone");
    await rank("user_gone", ["usa1"]);
    await round("user_gone", "usa1", "2026-09-01");
    expect(await all("user_a", 10)).toEqual([]);
  });
});
