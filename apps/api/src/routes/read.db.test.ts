import { courseSchema } from "@coursebook/domain/catalog/course";
import { count, eq } from "drizzle-orm";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  ClientConfigSchema,
  MeSchema,
  MemberListSchema,
  MembersSchema,
  MyCoursesSchema,
  RankingsSchema,
  RoundsSchema,
  SearchResultsSchema,
} from "../contract/schemas";
import { courseRankings, courses, friendships, users } from "../db/schema";
import { FriendshipStatus } from "../domain/friendship";
import { CLIENT_CLOSED_REQUEST } from "../http/errors";
import { allCourses, invalidateCatalog } from "../services/catalog";
import { logRounds } from "../services/journal";
import { createCourseSearch } from "../services/search";
import { createTestApp, TEST_CLIENT_CONFIG } from "../test/app";
import { resetMemberData, testDatabase } from "../test/db";

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
  invalidateCatalog();
});

/** Rankings stored by the seed migrations; the API must serve all of them. */
const storedRankings = async () => {
  const [row] = await db.select({ n: count() }).from(courseRankings);
  return row?.n ?? -1;
};

const seeded = async (stableId: string) => {
  const [row] = await db.select({ id: courses.id }).from(courses).where(eq(courses.stableId, stableId));
  if (!row) throw new Error("missing " + stableId);
  return row.id;
};

/** A member row as provisioning would create it. */
const member = (id: string, username: string) =>
  db.insert(users).values({ id, username, displayName: username + " Name", email: username + "@example.com" });

describe("GET /v1/me", () => {
  it("provisions the member from the token and returns the public fields", async () => {
    const t = createTestApp(db);
    const result = await t.get("/v1/me", t.bearer("user_1", "golfer_1"));
    expect(result.status).toBe(200);
    expect(MeSchema.parse(result.body)).toEqual({ username: "golfer_1", displayName: "golfer_1 Name" });
    const [row] = await db.select().from(users).where(eq(users.id, "user_1"));
    expect(row?.email).toBe("golfer_1@example.com");
  });
});

describe("GET /v1/me/courses", () => {
  it("returns the list in rank order with play counts and no emails", async () => {
    const t = createTestApp(db);
    await member("user_1", "golfer_1");
    const [a, b] = [await seeded("usa1"), await seeded("world1")];
    await logRounds(db, "user_1", { courseId: a }, 1);
    await logRounds(db, "user_1", { courseId: b }, 2);
    const result = await t.get("/v1/me/courses", t.bearer("user_1", "golfer_1"));
    expect(result.status).toBe(200);
    const body = MyCoursesSchema.parse(result.body);
    expect(body.courses.map((entry) => [entry.course.id, entry.rank, entry.played])).toEqual([
      [a, 1, 1],
      [b, 2, 2],
    ]);
    expect(body.courses[0]?.course.ranks.usa).toBe(1);
    expect(JSON.stringify(result.body)).not.toContain("example.com");
  });

  it("is empty for a new member", async () => {
    const t = createTestApp(db);
    expect((await t.get("/v1/me/courses", t.bearer("user_1", "golfer_1"))).body).toEqual({ courses: [] });
  });
});

describe("GET /v1/me/courses/{courseId}/rounds", () => {
  it("returns rounds newest first as playedOn dates", async () => {
    const t = createTestApp(db);
    await member("user_1", "golfer_1");
    const course = await seeded("usa1");
    await logRounds(db, "user_1", { courseId: course }, 1, "2026-04-01");
    await logRounds(db, "user_1", { courseId: course }, 1, "2026-05-01");
    const result = await t.get(`/v1/me/courses/${course}/rounds`, t.bearer("user_1", "golfer_1"));
    const body = RoundsSchema.parse(result.body);
    expect(body.rounds.map((round) => round.playedOn)).toEqual(["2026-05-01", "2026-04-01"]);
  });

  it("rejects a course id that is not a uuid", async () => {
    const t = createTestApp(db);
    const result = await t.get("/v1/me/courses/usa1/rounds", t.bearer("user_1", "golfer_1"));
    expect(result.status).toBe(400);
    expect(ApiErrorSchema.parse(result.body).error.fields?.[0]?.path).toBe("courseId");
  });
});

describe("GET /v1/rankings", () => {
  it("serves every published entry publicly with an ETag", async () => {
    const t = createTestApp(db);
    const result = await t.get("/v1/rankings");
    expect(result.status).toBe(200);
    const body = RankingsSchema.parse(result.body);
    expect(body.entries).toHaveLength(await storedRankings());
    expect(result.headers.get("cache-control")).toBe("public, max-age=3600, stale-while-revalidate=86400");
    const etag = result.headers.get("etag");
    expect(etag).toMatch(/^".+"$/);
    const again = await t.app.request("/v1/rankings", { headers: { "if-none-match": etag ?? "" } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
  });

  it("answers 304 to the weak ETag a gzip response carried", async () => {
    const t = createTestApp(db);
    const first = await t.app.request("/v1/rankings", { headers: { "accept-encoding": "gzip" } });
    const weak = first.headers.get("etag") ?? "";
    expect(weak).toMatch(/^W\//);
    const again = await t.app.request("/v1/rankings", { headers: { "accept-encoding": "gzip", "if-none-match": weak } });
    expect(again.status).toBe(304);
  });

  it("compresses the response for clients that accept gzip", async () => {
    const t = createTestApp(db);
    const response = await t.app.request("/v1/rankings", { headers: { "accept-encoding": "gzip" } });
    expect(response.headers.get("content-encoding")).toBe("gzip");
    const json: unknown = JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString());
    expect(RankingsSchema.parse(json).entries).toHaveLength(await storedRankings());
  });
});

describe("GET /v1/course-search", () => {
  const hit = (id: string, name: string) =>
    courseSchema.parse({ id, name, location: "Arcadia, MI, USA", city: "Arcadia", state: "MI", country: "USA", stateRank: 3 });

  it("maps catalog hits with their id and other hits with details only", async () => {
    const t = createTestApp(db);
    const catalogId = await seeded("usa1");
    // The second hit carries an OpenGolfAPI-style uuid that is not a catalog row.
    const external = hit("b25a4e85-561a-4ca4-8028-7c3480c9bbc0", "Arcadia South");
    t.setSearchResults([
      { course: hit(catalogId, "Arcadia Bluffs"), display: hit(catalogId, "Arcadia Bluffs"), catalogId },
      { course: external, display: external, catalogId: null },
    ]);
    const result = await t.get("/v1/course-search?q=Arcadia&source=external", t.bearer("user_1", "golfer_1"));
    const body = SearchResultsSchema.parse(result.body);
    expect(body.results.map((r) => [r.courseId, r.course.name])).toEqual([
      [catalogId, "Arcadia Bluffs"],
      [null, "Arcadia South"],
    ]);
    expect(body.results[0]?.ranks.state).toBe(3);
  });

  it("finds stored Oakland courses without calling external discovery", async () => {
    const t = createTestApp(db, { search: { search: () => { throw new Error("Catalog search must not call discovery"); } } });
    const result = await t.get("/v1/course-search?q=Oakland", t.bearer("user_1", "golfer_1"));
    expect(result.status).toBe(200);
    const body = SearchResultsSchema.parse(result.body);
    const katke = body.results.find((hit) => hit.course.name === "Oakland University: Katke-Cousins");
    expect(katke?.courseId).toBe("6f977d77-3e2d-4dbd-818e-cd8687de35cd");
    expect(katke?.ranks.state).toBeGreaterThan(0);
    expect(body).toMatchObject({ page: 1, pageSize: 10 });
    expect(body.total).toBeGreaterThan(0);
  });

  it.each(["page=0", "page=-1", "page=1.5", "page=oops", "page=2147483648", "source=other", "q=%00bad"])("rejects invalid search inputs: %s", async (parameter) => {
    const t = createTestApp(db);
    const query = parameter.startsWith("q=") ? parameter : "q=Oakland&" + parameter;
    const result = await t.get("/v1/course-search?" + query, t.bearer("user_1", "golfer_1"));
    expect(result.status).toBe(400);
  });

  it("paginates external results and returns totals on empty later pages", async () => {
    const t = createTestApp(db);
    const matches = Array.from({ length: 13 }, (_, index) => {
      const course = hit(`external-${index}`, `External Course ${index}`);
      return { course, display: course, catalogId: null };
    });
    t.setSearchResults(matches);
    const headers = t.bearer("user_1", "golfer_1");
    const first = SearchResultsSchema.parse((await t.get("/v1/course-search?q=External&source=external", headers)).body);
    const second = SearchResultsSchema.parse((await t.get("/v1/course-search?q=External&source=external&page=2", headers)).body);
    const last = SearchResultsSchema.parse((await t.get("/v1/course-search?q=External&source=external&page=3", headers)).body);
    expect(first.results).toHaveLength(10);
    expect(second.results.map((result) => result.course.name)).toEqual(["External Course 10", "External Course 11", "External Course 12"]);
    expect(second).toMatchObject({ total: 13, page: 2, pageSize: 10 });
    expect(last).toEqual({ results: [], total: 13, page: 3, pageSize: 10 });
  });

  it("requires a member", async () => {
    const t = createTestApp(db);
    expect((await t.get("/v1/course-search?q=Arcadia")).status).toBe(401);
  });

  it("reports search_unavailable when discovery fails, and logs it", async () => {
    const t = createTestApp(db);
    t.setSearchResults(new Error("both sources down"));
    const result = await t.get("/v1/course-search?q=Arcadia&source=external", t.bearer("user_1", "golfer_1"));
    expect(result.status).toBe(503);
    expect(ApiErrorSchema.parse(result.body).error.code).toBe("search_unavailable");
    expect(t.errors).toHaveLength(1);
  });

  it("neither reports nor logs a search the client cancelled as a server error", async () => {
    // @hono/node-server aborts the request of a closed connection with a string, not an Error.
    const client = new AbortController();
    const search = createCourseSearch({
      catalog: () => allCourses(db),
      apiUrl: "http://opengolf.invalid/v1/courses/search",
      csvUrl: "http://opengolf.invalid/opengolfapi-us.csv",
      fetcher: (_input, init) => {
        client.abort("Client connection prematurely closed.");
        // Throws the string reason, as fetch rejects with it.
        init?.signal?.throwIfAborted();
        return Promise.reject(new Error("the request signal should have been aborted"));
      },
    });
    const t = createTestApp(db, { search });
    const response = await t.app.request("/v1/course-search?q=Arcadia&source=external", {
      headers: t.bearer("user_1", "golfer_1"),
      signal: client.signal,
    });
    expect(response.status).toBe(CLIENT_CLOSED_REQUEST);
    expect(t.errors).toEqual([]);
    expect(t.requests).toEqual([expect.objectContaining({ path: "/v1/course-search", status: CLIENT_CLOSED_REQUEST })]);
  });
});

describe("members", () => {
  beforeEach(async () => {
    await member("user_1", "golfer_1");
    await member("user_2", "Bravo");
    await member("user_3", "charlie");
    await member("user_4", "stranger");
    await db.insert(friendships).values([
      { requesterId: "user_1", addresseeId: "user_2", status: FriendshipStatus.Accepted },
      { requesterId: "user_3", addresseeId: "user_1", status: FriendshipStatus.Accepted },
    ]);
  });

  it("pages the viewer's friends without the viewer, strangers or any email", async () => {
    const t = createTestApp(db);
    const first = MembersSchema.parse((await t.get("/v1/members?limit=1", t.bearer("user_1", "golfer_1"))).body);
    expect(first).toEqual({ members: [{ username: "Bravo", displayName: "Bravo Name" }], nextCursor: "Bravo" });
    const second = await t.get("/v1/members?limit=1&cursor=Bravo", t.bearer("user_1", "golfer_1"));
    expect(MembersSchema.parse(second.body)).toEqual({ members: [{ username: "charlie", displayName: "charlie Name" }], nextCursor: null });
    expect(JSON.stringify(second.body)).not.toContain("example.com");
  });

  it("rejects an out-of-range page size", async () => {
    const t = createTestApp(db);
    expect((await t.get("/v1/members?limit=0", t.bearer("user_1", "golfer_1"))).status).toBe(400);
  });

  it("shows another member's list with on-my-list flags, matching usernames case-insensitively", async () => {
    const t = createTestApp(db);
    const [a, b] = [await seeded("usa1"), await seeded("usa2")];
    await logRounds(db, "user_2", { courseId: a }, 1);
    await logRounds(db, "user_2", { courseId: b }, 1);
    await logRounds(db, "user_1", { courseId: b }, 1);
    const result = await t.get("/v1/members/bravo", t.bearer("user_1", "golfer_1"));
    const body = MemberListSchema.parse(result.body);
    expect(body.member).toEqual({ username: "Bravo", displayName: "Bravo Name" });
    expect(body.courses.map((c) => [c.course.id, c.rank, c.onMyList])).toEqual([
      [a, 1, false],
      [b, 2, true],
    ]);
    expect(body.courses[0]?.course.ranks.usa).toBe(1);
  });

  it.each(["nobody", "stranger"])("answers member_not_found for %s (unknown and non-friends look the same)", async (username) => {
    const t = createTestApp(db);
    await logRounds(db, "user_4", { courseId: await seeded("usa1") }, 1);
    const result = await t.get(`/v1/members/${username}`, t.bearer("user_1", "golfer_1"));
    expect(result.status).toBe(404);
    expect(ApiErrorSchema.parse(result.body).error.code).toBe("member_not_found");
    expect(JSON.stringify(result.body)).not.toContain("usa1");
  });
});

describe("GET /v1/client-config", () => {
  it("is public", async () => {
    const t = createTestApp(db);
    const result = await t.get("/v1/client-config");
    expect(ClientConfigSchema.parse(result.body)).toEqual(TEST_CLIENT_CONFIG);
  });
});
