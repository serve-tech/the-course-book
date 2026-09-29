import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  FriendRequestsSchema,
  MemberRelationshipSchema,
  MembersSchema,
  MemberSearchResultsSchema,
} from "../contract/schemas";
import { users } from "../db/schema";
import { createTestApp } from "../test/app";
import { resetMemberData, testDatabase } from "../test/db";

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
  await db.insert(users).values([
    { id: "user_1", username: "golfer_1", displayName: "golfer_1 Name", email: "one@example.com" },
    { id: "user_2", username: "Bravo", displayName: "Bravo Name", email: "two@example.com" },
  ]);
});

const errorCode = (body: unknown) => ApiErrorSchema.parse(body).error.code;

describe("friend requests over HTTP", () => {
  it("requests, lists, accepts by befriending back, and then shows the friend", async () => {
    const t = createTestApp(db);
    const one = t.bearer("user_1", "golfer_1");
    const two = t.bearer("user_2", "Bravo");

    const asked = await t.send("PUT", "/v1/me/friends/bravo", {}, one);
    expect(asked.status).toBe(200);
    expect(MemberRelationshipSchema.parse(asked.body)).toEqual({
      member: { username: "Bravo", displayName: "Bravo Name" },
      relationship: "requested",
    });
    expect(FriendRequestsSchema.parse((await t.get("/v1/me/friend-requests", two)).body)).toEqual({
      incoming: [{ username: "golfer_1", displayName: "golfer_1 Name" }],
      outgoing: [],
    });
    expect((await t.get("/v1/members/golfer_1", two)).status).toBe(404);

    const accepted = await t.send("PUT", "/v1/me/friends/golfer_1", {}, two);
    expect(MemberRelationshipSchema.parse(accepted.body).relationship).toBe("friends");
    expect(MembersSchema.parse((await t.get("/v1/members", one)).body).members).toEqual([
      { username: "Bravo", displayName: "Bravo Name" },
    ]);
    expect((await t.get("/v1/members/golfer_1", two)).status).toBe(200);
  });

  it("removes a friendship with 204, then answers friendship_not_found", async () => {
    const t = createTestApp(db);
    const one = t.bearer("user_1", "golfer_1");
    await t.send("PUT", "/v1/me/friends/bravo", {}, one);
    const removed = await t.app.request("/v1/me/friends/bravo", { method: "DELETE", headers: one });
    expect(removed.status).toBe(204);
    const again = await t.app.request("/v1/me/friends/bravo", { method: "DELETE", headers: one });
    expect(again.status).toBe(404);
    expect(errorCode(await again.json())).toBe("friendship_not_found");
  });

  it.each([
    ["the member's own username", "golfer_1", 400, "validation_failed"],
    ["an unknown username", "nobody", 404, "member_not_found"],
  ])("rejects befriending %s", async (_label, username, status, code) => {
    const t = createTestApp(db);
    const result = await t.send("PUT", `/v1/me/friends/${username}`, {}, t.bearer("user_1", "golfer_1"));
    expect(result.status).toBe(status);
    expect(errorCode(result.body)).toBe(code);
  });
});

describe("GET /v1/member-search", () => {
  it("finds members by username with the viewer's relationship, privately", async () => {
    const t = createTestApp(db);
    const one = t.bearer("user_1", "golfer_1");
    await t.send("PUT", "/v1/me/friends/bravo", {}, one);
    const result = await t.get("/v1/member-search?q=RAV", one);
    expect(MemberSearchResultsSchema.parse(result.body)).toEqual({
      results: [{ member: { username: "Bravo", displayName: "Bravo Name" }, relationship: "requested" }],
    });
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(result.body)).not.toMatch(/example\.com|user_2/);
  });

  it("needs at least three characters", async () => {
    const t = createTestApp(db);
    const result = await t.get("/v1/member-search?q=%20br%20", t.bearer("user_1", "golfer_1"));
    expect(result.status).toBe(400);
    expect(errorCode(result.body)).toBe("validation_failed");
  });
});
