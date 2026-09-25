import { eq } from "drizzle-orm";
import { RouterContextProvider } from "react-router";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { courses, users } from "@coursebook/api/db/schema";
import { userContext } from "../server/auth.server";
import { logRounds, roundHistory } from "@coursebook/api/services/journal";
import { resetMemberData, testDatabase } from "@coursebook/api/test/db";
import { action, loader } from "./journal";

const { db, pool } = testDatabase();
const USER = { id: "user_r", username: "route", displayName: "Route" };

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
  await db.insert(users).values({ id: USER.id, username: USER.username, displayName: USER.displayName });
});

function post(fields: Record<string, string>, user: typeof USER | null = USER) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  const request = new Request("http://localhost/journal", { method: "POST", body });
  const context = new RouterContextProvider();
  if (user) context.set(userContext, user);
  return action({ request, context, params: {}, url: new URL(request.url), pattern: "/journal" });
}

const seeded = async (stableId: string) => {
  const [row] = await db.select({ id: courses.id }).from(courses).where(eq(courses.stableId, stableId));
  if (!row) throw new Error("missing " + stableId);
  return row.id;
};

const unwrap = (reply: unknown) =>
  typeof reply === "object" && reply !== null && "data" in reply
    ? { ...(reply as { data: object; init?: { status?: number } }).data, status: (reply as { init?: { status?: number } }).init?.status }
    : (reply as object);

describe("journal action", () => {
  it("returns a 401 reply for anonymous requests instead of throwing", async () => {
    expect(unwrap(await post({ intent: "top", courseId: await seeded("usa1") }, null))).toMatchObject({ status: 401 });
  });

  it("rejects unknown intents and bad fields with a readable 400", async () => {
    expect(unwrap(await post({ intent: "explode" }))).toMatchObject({ status: 400 });
    expect(unwrap(await post({ intent: "add-course", name: "", country: "USA" }))).toMatchObject({ status: 400, error: "Enter a course name" });
    expect(unwrap(await post({ intent: "add-course", name: "Somewhere", country: "USA", state: "" }))).toMatchObject({ error: "Select a state for a U.S. course" });
  });

  it("logs rounds for a searched course given as a blob and requires a US state", async () => {
    const blob = JSON.stringify({ name: "Mystery Meadows", location: "Nowhere, KS, USA", city: "Nowhere", state: "KS", country: "USA" });
    expect(unwrap(await post({ intent: "log", course: blob, quantity: "2" }))).toMatchObject({ ok: true, count: 2, message: "2 rounds added" });
    const stateless = JSON.stringify({ name: "Nowhere Nine", location: "USA", country: "USA" });
    expect(unwrap(await post({ intent: "log", course: stateless }))).toMatchObject({ error: "Select a state before logging this U.S. course" });
  });

  it("moves, counts, deletes and reports the outcome", async () => {
    const a = await seeded("usa1");
    const b = await seeded("usa2");
    await logRounds(db, USER.id, { courseId: a }, 2);
    await logRounds(db, USER.id, { courseId: b }, 1);
    expect(unwrap(await post({ intent: "move", courseId: b, rank: "1" }))).toMatchObject({ rank: 1, message: "Moved to #1" });
    expect(unwrap(await post({ intent: "set-count", courseId: a, count: "5" }))).toMatchObject({ count: 5, removed: false });
    const [round] = await roundHistory(db, USER.id, b);
    expect(unwrap(await post({ intent: "delete-round", roundId: round?.id ?? "" }))).toMatchObject({ removedCourse: true });
    expect(unwrap(await post({ intent: "delete-course", courseId: a }))).toMatchObject({ message: "Course deleted from My List" });
    expect(unwrap(await post({ intent: "delete-course", courseId: a }))).toMatchObject({ status: 404 });
  });

  it("adds a custom course at the requested rank", async () => {
    await logRounds(db, USER.id, { courseId: await seeded("usa1") }, 1);
    expect(unwrap(await post({ intent: "add-course", name: "Backyard Nine", city: "Hometown", state: "OH", country: "USA", rank: "1" }))).toMatchObject({ rank: 1, message: "Course added at #1" });
    expect(unwrap(await post({ intent: "add-course", name: "Links Abroad", city: "Dundee", state: "", country: "Scotland", rank: "" }))).toMatchObject({ rank: 3 });
  });

  it("serves the caller's round history", async () => {
    const a = await seeded("usa1");
    await logRounds(db, USER.id, { courseId: a }, 2, "2026-04-04");
    const context = new RouterContextProvider();
    context.set(userContext, USER);
    const request = new Request("http://localhost/journal?courseId=" + a);
    const result = await loader({ request, context, params: {}, url: new URL(request.url), pattern: "/journal" });
    expect(unwrap(result)).toMatchObject({ rounds: [{ playedAt: "2026-04-04" }, { playedAt: "2026-04-04" }] });
  });
});
