import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ApiErrorSchema } from "../contract/schemas";
import { users } from "../db/schema";
import { createTestApp, WEB_ORIGIN } from "../test/app";
import { resetMemberData, testDatabase } from "../test/db";

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
});

/** Assert an error envelope with the given status and code. */
const expectError = (result: { status: number; body: unknown; headers: Headers }, status: number, code: string) => {
  expect(result.status).toBe(status);
  const body = ApiErrorSchema.parse(result.body);
  expect(body.error.code).toBe(code);
  expect(body.error.requestId).toBe(result.headers.get("x-request-id"));
  return body.error;
};

describe("health", () => {
  it("answers ok and is not logged", async () => {
    const t = createTestApp(db);
    const result = await t.get("/healthz");
    expect(result).toMatchObject({ status: 200, body: { ok: true } });
    expect(t.requests).toHaveLength(0);
  });
});

describe("error envelope", () => {
  it("returns not_found for unknown paths", async () => {
    const t = createTestApp(db);
    expectError(await t.get("/v1/nothing-here"), 404, "not_found");
  });

  it("logs every API request with its id and status", async () => {
    const t = createTestApp(db);
    const result = await t.get("/v1/client-config");
    expect(t.requests).toEqual([
      expect.objectContaining({ method: "GET", path: "/v1/client-config", status: 200, requestId: result.headers.get("x-request-id") }),
    ]);
  });

  it("hides unexpected failures behind internal and logs them", async () => {
    const t = createTestApp(db, {
      provisioner: { resolve: () => Promise.reject(new Error("boom")), forget: () => undefined },
    });
    const error = expectError(await t.get("/v1/me", t.bearer("user_1", "golfer_1")), 500, "internal");
    expect(error.message).not.toContain("boom");
    expect(t.errors).toEqual([expect.objectContaining({ message: "boom" })]);
  });
});

describe("authentication", () => {
  it("rejects a secured operation without a token", async () => {
    const t = createTestApp(db);
    expectError(await t.get("/v1/me"), 401, "unauthenticated");
  });

  it.each([
    ["an expired token", (t: ReturnType<typeof createTestApp>) => t.tokens.issue({ sub: "user_1", username: "golfer_1" }, { expiresIn: -120 })],
    ["a forged token", (t: ReturnType<typeof createTestApp>) => t.tokens.forge({ sub: "user_1", username: "golfer_1" })],
    ["a web token from another origin", (t: ReturnType<typeof createTestApp>) => t.tokens.issue({ sub: "user_1", username: "golfer_1", azp: "https://evil.example" })],
  ])("rejects %s even on a public operation", async (_label, token) => {
    const t = createTestApp(db);
    expectError(await t.get("/v1/client-config", { authorization: "Bearer " + token(t) }), 401, "unauthenticated");
  });

  it("accepts web tokens from the web origin and native tokens without azp", async () => {
    const t = createTestApp(db);
    expect((await t.get("/v1/me", t.bearer("user_1", "golfer_1", { azp: WEB_ORIGIN }))).status).toBe(200);
    expect((await t.get("/v1/me", t.bearer("user_2", "golfer_2"))).status).toBe(200);
  });

  it("refuses accounts whose username breaks the product rule", async () => {
    const t = createTestApp(db);
    expectError(await t.get("/v1/me", t.bearer("user_1", "bad-name")), 403, "username_invalid");
    expect(await db.select().from(users).where(eq(users.id, "user_1"))).toHaveLength(0);
  });
});

describe("validation", () => {
  it("reports invalid parameters per field with a readable summary", async () => {
    const t = createTestApp(db);
    const error = expectError(await t.get("/v1/course-search?q=a", t.bearer("user_1", "golfer_1")), 400, "validation_failed");
    expect(error.message).toBe("Enter at least two characters.");
    expect(error.fields).toEqual([{ path: "q", message: "Enter at least two characters." }]);
  });
});

describe("CORS", () => {
  const preflight = (t: ReturnType<typeof createTestApp>, origin: string) =>
    t.app.request("/v1/me/courses", {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "GET", "access-control-request-headers": "authorization" },
    });

  it("answers a preflight from the web origin", async () => {
    const response = await preflight(createTestApp(db), WEB_ORIGIN);
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("authorization");
    expect(response.headers.get("access-control-max-age")).toBe("7200");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("does not allow other origins", async () => {
    const response = await preflight(createTestApp(db), "https://evil.example");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("cache headers", () => {
  it("marks personal responses private and public settings cacheable", async () => {
    const t = createTestApp(db);
    expect((await t.get("/v1/me", t.bearer("user_1", "golfer_1"))).headers.get("cache-control")).toBe("private, no-store");
    expect((await t.get("/v1/client-config")).headers.get("cache-control")).toBe("public, max-age=300");
  });
});
