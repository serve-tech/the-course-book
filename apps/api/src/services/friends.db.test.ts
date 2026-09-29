import { and, eq, or } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Relationship } from "@coursebook/domain/friends/types";
import { courses, friendships, users } from "../db/schema";
import { resetMemberData, testDatabase } from "../test/db";
import { deleteAccountData } from "./accounts";
import { ErrorCode } from "./errors";
import {
  befriendMember,
  friendRequests,
  memberList,
  memberPage,
  removeFriend,
  searchMembers,
} from "./friends";
import { logRounds } from "./journal";

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
  await db.insert(users).values([
    { id: "user_a", username: "alpha", displayName: "Alpha", email: "alpha@example.com" },
    { id: "user_b", username: "bravo", displayName: "Bravo", email: "bravo@example.com" },
    { id: "user_c", username: "Charlie", displayName: "Charlie" },
    { id: "user_d", username: "delta", displayName: "Delta" },
    { id: "user_gone", username: "gone", displayName: "Gone", deletedAt: new Date() },
  ]);
});

const seeded = async (stableId: string) => {
  const [row] = await db.select({ id: courses.id }).from(courses).where(eq(courses.stableId, stableId));
  if (!row) throw new Error("missing " + stableId);
  return row.id;
};

/** Make two members friends directly, as an accepted row. */
const friends = (requesterId: string, addresseeId: string) =>
  db.insert(friendships).values({ requesterId, addresseeId, status: "accepted" });

const rowsBetween = (a: string, b: string) =>
  db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
        and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
      ),
    );

describe("friends directory", () => {
  it("lists only accepted friends, in either direction, with public fields only", async () => {
    await friends("user_a", "user_b");
    await friends("user_c", "user_a");
    await db.insert(friendships).values({ requesterId: "user_a", addresseeId: "user_d" });
    const page = await memberPage(db, "user_a", { after: null, limit: 50 });
    expect(page.members).toEqual([
      { username: "bravo", displayName: "Bravo" },
      { username: "Charlie", displayName: "Charlie" },
    ]);
    expect(JSON.stringify(page)).not.toContain("example.com");
  });

  it("pages by case-insensitive username with a cursor until the end", async () => {
    for (const other of ["user_b", "user_c", "user_d"]) await friends("user_a", other);
    const first = await memberPage(db, "user_a", { after: null, limit: 2 });
    expect(first.members.map((m) => m.username)).toEqual(["bravo", "Charlie"]);
    expect(first.nextCursor).toBe("Charlie");
    const second = await memberPage(db, "user_a", { after: first.nextCursor, limit: 2 });
    expect(second.members.map((m) => m.username)).toEqual(["delta"]);
    expect(second.nextCursor).toBeNull();
  });

  it("never lists deleted members even when a friendship row remains", async () => {
    await friends("user_a", "user_gone");
    expect((await memberPage(db, "user_a", { after: null, limit: 50 })).members).toEqual([]);
  });
});

describe("member list", () => {
  it("returns a friend's ranking with on-my-list evidence", async () => {
    await friends("user_b", "user_a");
    const a = await seeded("usa1");
    const b = await seeded("usa2");
    await logRounds(db, "user_b", { courseId: b }, 1);
    await logRounds(db, "user_b", { courseId: a }, 1);
    await logRounds(db, "user_a", { courseId: a }, 3);
    const result = await memberList(db, "user_a", "BRAVO");
    expect(result?.member).toEqual({ username: "bravo", displayName: "Bravo" });
    expect(result?.rows.map((row) => [row.rank, row.course.id, row.onMyList])).toEqual([
      [1, b, false],
      [2, a, true],
    ]);
    expect(JSON.stringify(result)).not.toContain("user_b");
  });

  it("treats an equivalent duplicate catalog row as already listed", async () => {
    await friends("user_a", "user_b");
    const duplicates = await db.select({ id: courses.id }).from(courses).where(eq(courses.nameKey, "friars head"));
    if (duplicates.length < 2) throw new Error("expected duplicate Friar's Head rows in the seed");
    await logRounds(db, "user_b", { courseId: duplicates[0]?.id ?? "" }, 1);
    await logRounds(db, "user_a", { courseId: duplicates[1]?.id ?? "" }, 1);
    expect((await memberList(db, "user_a", "bravo"))?.rows[0]?.onMyList).toBe(true);
  });

  it("returns the viewer's own list", async () => {
    await logRounds(db, "user_a", { courseId: await seeded("usa1") }, 1);
    expect((await memberList(db, "user_a", "alpha"))?.rows).toHaveLength(1);
  });

  it.each([
    ["a member who is not a friend", "bravo", () => Promise.resolve()],
    ["a member with only a pending request", "bravo", () => db.insert(friendships).values({ requesterId: "user_b", addresseeId: "user_a" })],
    ["an unknown member", "nobody", () => Promise.resolve()],
    ["a deleted member", "gone", () => friends("user_a", "user_gone")],
  ])("returns null for %s", async (_label, username, setup) => {
    await setup();
    await logRounds(db, "user_b", { courseId: await seeded("usa1") }, 1);
    expect(await memberList(db, "user_a", username)).toBeNull();
  });
});

describe("friend requests", () => {
  it("sends a request, lists it on both sides, and the other member accepts by befriending back", async () => {
    expect(await befriendMember(db, "user_a", "Bravo")).toEqual({
      member: { username: "bravo", displayName: "Bravo" },
      relationship: Relationship.Requested,
    });
    expect(await friendRequests(db, "user_a")).toEqual({ incoming: [], outgoing: [{ username: "bravo", displayName: "Bravo" }] });
    expect(await friendRequests(db, "user_b")).toEqual({ incoming: [{ username: "alpha", displayName: "Alpha" }], outgoing: [] });
    expect(await memberList(db, "user_a", "bravo")).toBeNull();

    expect((await befriendMember(db, "user_b", "alpha")).relationship).toBe(Relationship.Friends);
    expect(await rowsBetween("user_a", "user_b")).toMatchObject([{ requesterId: "user_a", status: "accepted" }]);
    expect(await friendRequests(db, "user_b")).toEqual({ incoming: [], outgoing: [] });
    expect(await memberList(db, "user_a", "bravo")).not.toBeNull();
    expect(await memberList(db, "user_b", "alpha")).not.toBeNull();
  });

  it("is idempotent", async () => {
    await befriendMember(db, "user_a", "bravo");
    expect((await befriendMember(db, "user_a", "bravo")).relationship).toBe(Relationship.Requested);
    await befriendMember(db, "user_b", "alpha");
    expect((await befriendMember(db, "user_a", "bravo")).relationship).toBe(Relationship.Friends);
    expect(await rowsBetween("user_a", "user_b")).toHaveLength(1);
  });

  it("ends as one friendship when both members ask at the same time", async () => {
    const [first, second] = await Promise.all([befriendMember(db, "user_a", "bravo"), befriendMember(db, "user_b", "alpha")]);
    expect([first.relationship, second.relationship].sort()).toEqual([Relationship.Friends, Relationship.Requested].sort());
    expect(await rowsBetween("user_a", "user_b")).toMatchObject([{ status: "accepted" }]);
  });

  it.each([
    ["the viewer's own username", "alpha", { status: 400, code: ErrorCode.ValidationFailed }],
    ["an unknown username", "nobody", { status: 404, code: ErrorCode.MemberNotFound }],
    ["a deleted member", "gone", { status: 404, code: ErrorCode.MemberNotFound }],
  ])("rejects %s", async (_label, username, expected) => {
    await expect(befriendMember(db, "user_a", username)).rejects.toMatchObject(expected);
  });

  it.each([
    ["unfriends", () => friends("user_a", "user_b")],
    ["cancels the viewer's request", () => db.insert(friendships).values({ requesterId: "user_a", addresseeId: "user_b" })],
    ["declines the other member's request", () => db.insert(friendships).values({ requesterId: "user_b", addresseeId: "user_a" })],
  ])("removing %s", async (_label, setup) => {
    await setup();
    await removeFriend(db, "user_a", "bravo");
    expect(await rowsBetween("user_a", "user_b")).toEqual([]);
    await expect(removeFriend(db, "user_a", "bravo")).rejects.toMatchObject({ status: 404, code: ErrorCode.FriendshipNotFound });
  });
});

describe("member search", () => {
  it("matches usernames containing the text, prefix matches first, with the viewer's relationship", async () => {
    await db.insert(users).values({ id: "user_e", username: "xalphax", displayName: "Echo" });
    await friends("user_b", "user_a");
    await db.insert(friendships).values({ requesterId: "user_a", addresseeId: "user_c" });
    await db.insert(friendships).values({ requesterId: "user_d", addresseeId: "user_a" });
    expect(await searchMembers(db, "user_a", "ALP")).toEqual([
      { member: { username: "xalphax", displayName: "Echo" }, relationship: Relationship.None },
    ]);
    const all = await searchMembers(db, "user_b", "a");
    expect(all.map((hit) => hit.member.username)).toEqual(["alpha", "Charlie", "delta", "xalphax"]);
    expect(Object.fromEntries((await searchMembers(db, "user_a", "  r  ")).map((hit) => [hit.member.username, hit.relationship]))).toEqual({
      bravo: Relationship.Friends,
      Charlie: Relationship.Requested,
    });
    expect((await searchMembers(db, "user_a", "delt"))[0]?.relationship).toBe(Relationship.Incoming);
  });

  it("never returns the viewer, deleted members, emails or ids", async () => {
    const hits = await searchMembers(db, "user_a", "o");
    expect(hits.map((hit) => hit.member.username)).toEqual(["bravo"]);
    expect(JSON.stringify(hits)).not.toMatch(/example\.com|user_/);
  });

  it("matches % and _ literally", async () => {
    await db.insert(users).values({ id: "user_f", username: "under_score", displayName: "Under" });
    expect((await searchMembers(db, "user_a", "r_s")).map((hit) => hit.member.username)).toEqual(["under_score"]);
    expect(await searchMembers(db, "user_a", "%%%")).toEqual([]);
  });
});

describe("account deletion", () => {
  it("removes the member's friendships and requests in both directions", async () => {
    await friends("user_a", "user_b");
    await db.insert(friendships).values({ requesterId: "user_c", addresseeId: "user_a" });
    await deleteAccountData(db, "user_a");
    expect(await db.select().from(friendships)).toEqual([]);
    expect((await memberPage(db, "user_b", { after: null, limit: 50 })).members).toEqual([]);
  });
});
