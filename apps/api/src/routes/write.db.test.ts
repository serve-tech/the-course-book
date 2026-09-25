import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  AddedCourseSchema,
  AddedToListSchema,
  ApiErrorSchema,
  DeletedRoundSchema,
  LoggedRoundsSchema,
  MovedCourseSchema,
  MyCoursesSchema,
  PlayCountSchema,
} from "../contract/schemas";
import { courses, rounds, userCourses, users } from "../db/schema";
import { invalidateCatalog } from "../services/catalog";
import { logRounds, roundHistory } from "../services/journal";
import { createTestApp } from "../test/app";
import { resetMemberData, testDatabase } from "../test/db";

/**
 * Write endpoints against the test database. Ports every case of the web
 * journal action's tests (apps/web/app/routes/journal.db.test.ts) to the API,
 * plus the API-only behaviour: body formats, idempotent adds and account
 * deletion.
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

const errorOf = (body: unknown) => ApiErrorSchema.parse(body).error;

/** A test app with member user_1 provisioned. */
async function signedIn() {
  const t = createTestApp(db);
  const auth = t.bearer("user_1", "golfer_1");
  expect((await t.get("/v1/me", auth)).status).toBe(200);
  return { t, auth };
}

describe("adding a catalog course", () => {
  it("rejects anonymous requests", async () => {
    const t = createTestApp(db);
    const result = await t.send("PUT", `/v1/me/courses/${await seeded("usa1")}`, {});
    expect(result.status).toBe(401);
  });

  it("adds with one round and reports added only the first time", async () => {
    const { t, auth } = await signedIn();
    const course = await seeded("usa1");
    const first = AddedToListSchema.parse((await t.send("PUT", `/v1/me/courses/${course}`, { playedOn: "2026-06-01" }, auth)).body);
    expect(first).toMatchObject({ added: true, courses: [{ rank: 1, played: 1 }] });
    const again = AddedToListSchema.parse((await t.send("PUT", `/v1/me/courses/${course}`, {}, auth)).body);
    expect(again).toMatchObject({ added: false, courses: [{ played: 1 }] });
    expect((await roundHistory(db, "user_1", course)).map((r) => r.playedAt)).toEqual(["2026-06-01"]);
  });

  it("answers course_not_found for an unknown course", async () => {
    const { t, auth } = await signedIn();
    const result = await t.send("PUT", "/v1/me/courses/00000000-0000-4000-8000-000000000000", {}, auth);
    expect(result.status).toBe(404);
    expect(errorOf(result.body).code).toBe("course_not_found");
  });
});

describe("adding a course by details", () => {
  it("rejects bad fields with readable messages", async () => {
    const { t, auth } = await signedIn();
    const empty = await t.send("POST", "/v1/me/courses", { source: "manual", course: { name: "", country: "USA" } }, auth);
    expect(empty.status).toBe(400);
    expect(errorOf(empty.body)).toMatchObject({ code: "validation_failed", message: "Enter a course name." });
    const stateless = await t.send("POST", "/v1/me/courses", { source: "manual", course: { name: "Somewhere", country: "USA", state: null } }, auth);
    expect(errorOf(stateless.body)).toMatchObject({ code: "us_state_required", message: "Select a state for this U.S. course." });
  });

  it("logs rounds for a searched course and requires a U.S. state", async () => {
    const { t, auth } = await signedIn();
    const hit = { name: "Mystery Meadows", location: "Nowhere, KS, USA", city: "Nowhere", state: "KS", country: "USA" };
    const result = await t.send("POST", "/v1/me/courses", { source: "search", course: hit, quantity: 2 }, auth);
    expect(result.status).toBe(200);
    expect(AddedCourseSchema.parse(result.body)).toMatchObject({ rank: 1, courses: [{ played: 2, course: { name: "Mystery Meadows" } }] });
    const stateless = await t.send("POST", "/v1/me/courses", { source: "search", course: { name: "Nowhere Nine", location: "USA", country: "USA" } }, auth);
    expect(errorOf(stateless.body).code).toBe("us_state_required");
  });

  it("adds a custom course at the requested rank, or at the bottom", async () => {
    const { t, auth } = await signedIn();
    await logRounds(db, "user_1", { courseId: await seeded("usa1") }, 1);
    const custom = await t.send("POST", "/v1/me/courses", { source: "manual", course: { name: "Backyard Nine", city: "Hometown", state: "OH", country: "USA" }, rank: 1 }, auth);
    expect(AddedCourseSchema.parse(custom.body).rank).toBe(1);
    const [row] = await db.select().from(courses).where(eq(courses.name, "Backyard Nine"));
    expect(row).toMatchObject({ isCustom: true, createdBy: "user_1" });
    const abroad = await t.send("POST", "/v1/me/courses", { source: "manual", course: { name: "Links Abroad", city: "Dundee", state: null, country: "Scotland" }, rank: null }, auth);
    expect(AddedCourseSchema.parse(abroad.body).rank).toBe(3);
  });

  it("treats missing and null optional fields alike, as Swift and Kotlin send them", async () => {
    const { t, auth } = await signedIn();
    const swift = await t.send("POST", "/v1/me/courses", { source: "manual", course: { name: "Swift Links", city: "Austin", state: "TX", country: "USA" } }, auth);
    const kotlin = await t.send("POST", "/v1/me/courses", { source: "manual", course: { name: "Kotlin Links", city: "Austin", state: "TX", country: "USA", location: null, logoUrl: null, websiteUrl: null }, rank: null, quantity: null, playedOn: null }, auth);
    expect([swift.status, kotlin.status]).toEqual([200, 200]);
  });
});

describe("logging rounds at a catalog course", () => {
  it("adds the course if needed and logs the rounds on the given date", async () => {
    const { t, auth } = await signedIn();
    const course = await seeded("usa1");
    const result = await t.send("POST", `/v1/me/courses/${course}/rounds`, { quantity: 3, playedOn: "2026-06-03" }, auth);
    expect(LoggedRoundsSchema.parse(result.body)).toMatchObject({ added: 3, courses: [{ played: 3 }] });
    expect(new Set((await roundHistory(db, "user_1", course)).map((r) => r.playedAt))).toEqual(new Set(["2026-06-03"]));
  });

  it.each([
    ["zero rounds", { quantity: 0 }, "Log at least one round."],
    ["too many rounds", { quantity: 101 }, "Log at most 100 rounds at a time."],
    ["a malformed date", { playedOn: "06/03/2026" }, undefined],
  ])("rejects %s", async (_label, body, message) => {
    const { t, auth } = await signedIn();
    const result = await t.send("POST", `/v1/me/courses/${await seeded("usa1")}/rounds`, body, auth);
    expect(result.status).toBe(400);
    if (message) expect(errorOf(result.body).message).toBe(message);
  });
});

describe("moving, counting and deleting", () => {
  it("moves, counts, deletes and reports the outcome with the updated list", async () => {
    const { t, auth } = await signedIn();
    const a = await seeded("usa1");
    const b = await seeded("usa2");
    await logRounds(db, "user_1", { courseId: a }, 2);
    await logRounds(db, "user_1", { courseId: b }, 1);

    const moved = MovedCourseSchema.parse((await t.send("PUT", `/v1/me/courses/${b}/rank`, { rank: 1 }, auth)).body);
    expect(moved.rank).toBe(1);
    expect(moved.courses.map((entry) => entry.course.id)).toEqual([b, a]);

    const counted = PlayCountSchema.parse((await t.send("PUT", `/v1/me/courses/${a}/play-count`, { count: 5 }, auth)).body);
    expect(counted).toMatchObject({ count: 5, removed: false });

    const [round] = await roundHistory(db, "user_1", b);
    const deleted = await t.app.request(`/v1/me/rounds/${round?.id ?? ""}`, { method: "DELETE", headers: auth });
    expect(DeletedRoundSchema.parse(await deleted.json())).toMatchObject({ courseId: b, removedCourse: true, courses: [{ course: { id: a }, rank: 1 }] });

    const removed = await t.app.request(`/v1/me/courses/${a}`, { method: "DELETE", headers: auth });
    expect(MyCoursesSchema.parse(await removed.json())).toEqual({ courses: [] });
    const again = await t.app.request(`/v1/me/courses/${a}`, { method: "DELETE", headers: auth });
    expect(again.status).toBe(404);
    expect(errorOf(await again.json()).code).toBe("not_on_list");
  });

  it("zero removes a course", async () => {
    const { t, auth } = await signedIn();
    const a = await seeded("usa1");
    await logRounds(db, "user_1", { courseId: a }, 1);
    const result = PlayCountSchema.parse((await t.send("PUT", `/v1/me/courses/${a}/play-count`, { count: 0 }, auth)).body);
    expect(result).toEqual({ count: 0, removed: true, courses: [] });
  });

  it("rejects a rank below one", async () => {
    const { t, auth } = await signedIn();
    expect((await t.send("PUT", `/v1/me/courses/${await seeded("usa1")}/rank`, { rank: 0 }, auth)).status).toBe(400);
  });
});

describe("request bodies", () => {
  it("requires Content-Type: application/json", async () => {
    const { t, auth } = await signedIn();
    const response = await t.app.request(`/v1/me/courses/${await seeded("usa1")}`, { method: "PUT", headers: auth, body: "{}" });
    expect(response.status).toBe(415);
    expect(errorOf(await response.json()).code).toBe("unsupported_media_type");
  });

  it("rejects unreadable JSON", async () => {
    const { t, auth } = await signedIn();
    const result = await t.send("PUT", `/v1/me/courses/${await seeded("usa1")}`, "{not json", auth);
    expect(result.status).toBe(400);
    expect(errorOf(result.body).code).toBe("bad_request");
  });

  it("rejects bodies over 32 KB", async () => {
    const { t, auth } = await signedIn();
    const result = await t.send("POST", "/v1/me/courses", { source: "manual", course: { name: "x".repeat(40_000), country: "USA" } }, auth);
    expect(result.status).toBe(413);
    expect(errorOf(result.body).code).toBe("payload_too_large");
  });
});

describe("DELETE /v1/me", () => {
  it("deletes the data and the Clerk user, and the old token stops working", async () => {
    const { t, auth } = await signedIn();
    await logRounds(db, "user_1", { courseId: await seeded("usa1") }, 2);
    const response = await t.app.request("/v1/me", { method: "DELETE", headers: auth });
    expect(response.status).toBe(204);
    expect(t.deletedAccounts).toEqual(["user_1"]);
    expect(await db.select().from(rounds).where(eq(rounds.userId, "user_1"))).toHaveLength(0);
    expect(await db.select().from(userCourses).where(eq(userCourses.userId, "user_1"))).toHaveLength(0);
    const [row] = await db.select().from(users).where(eq(users.id, "user_1"));
    expect(row?.email).toBeNull();
    const after = await t.get("/v1/me", auth);
    expect(after.status).toBe(401);
    expect(errorOf(after.body).code).toBe("account_deleted");
  });

  it("finishes on retry when Clerk fails the first time", async () => {
    const { t, auth } = await signedIn();
    t.failAccountDeletion(new Error("Clerk unavailable"));
    const first = await t.app.request("/v1/me", { method: "DELETE", headers: auth });
    expect(first.status).toBe(502);
    expect(errorOf(await first.json()).code).toBe("account_deletion_incomplete");
    const [row] = await db.select().from(users).where(eq(users.id, "user_1"));
    expect(row?.deletedAt).not.toBeNull();
    t.failAccountDeletion(null);
    const retry = await t.app.request("/v1/me", { method: "DELETE", headers: auth });
    expect(retry.status).toBe(204);
    expect(t.deletedAccounts).toEqual(["user_1"]);
  });

  it("requires a member", async () => {
    const t = createTestApp(db);
    expect((await t.app.request("/v1/me", { method: "DELETE" })).status).toBe(401);
    expect(t.deletedAccounts).toEqual([]);
  });
});

describe("privacy", () => {
  it("never returns an email address from a write", async () => {
    const { t, auth } = await signedIn();
    const result = await t.send("PUT", `/v1/me/courses/${await seeded("usa1")}`, {}, auth);
    expect(JSON.stringify(result.body)).not.toContain("example.com");
  });
});
