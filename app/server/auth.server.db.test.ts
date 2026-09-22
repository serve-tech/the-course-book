import { eq } from "drizzle-orm";
import { RouterContextProvider } from "react-router";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "../db/schema";
import { resetMemberData, testDatabase } from "../test/db";
import {
  identityFromClaims,
  provisionUser,
  requireUser,
  userContext,
} from "./auth.server";

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
});

const identity = {
  username: "golfer_1",
  displayName: "Golfer One",
  email: "golfer@example.com",
  avatarUrl: null,
};

describe("user provisioning", () => {
  it("creates the row on first sight and returns the app user", async () => {
    const user = await provisionUser(db, "user_1", identity);
    expect(user).toEqual({ id: "user_1", username: "golfer_1", displayName: "Golfer One" });
    const [row] = await db.select().from(users).where(eq(users.id, "user_1"));
    expect(row?.email).toBe("golfer@example.com");
  });

  it("refreshes changed fields and clears a soft delete", async () => {
    await provisionUser(db, "user_1", identity);
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, "user_1"));
    const user = await provisionUser(db, "user_1", { ...identity, displayName: "G. One" });
    expect(user.displayName).toBe("G. One");
    const [row] = await db.select().from(users).where(eq(users.id, "user_1"));
    expect(row?.deletedAt).toBeNull();
  });

  it("falls back to the username as display name", async () => {
    const user = await provisionUser(db, "user_1", { ...identity, displayName: "  " });
    expect(user.displayName).toBe("golfer_1");
  });

  it("rejects usernames outside the product rule with a 403 response", async () => {
    await expect(
      provisionUser(db, "user_1", { ...identity, username: "bad-name" }),
    ).rejects.toMatchObject({ init: { status: 403 } });
    expect(await db.select().from(users)).toHaveLength(0);
  });
});

describe("identity from session claims", () => {
  it("reads the custom claims and defaults the display name", () => {
    expect(
      identityFromClaims({ sub: "user_1", username: "golfer_1", email: "g@example.com" }),
    ).toEqual({ username: "golfer_1", displayName: "golfer_1", email: "g@example.com", avatarUrl: null });
  });

  it("returns undefined without a username claim so the backend is consulted", () => {
    expect(identityFromClaims({ sub: "user_1" })).toBeUndefined();
    expect(identityFromClaims(null)).toBeUndefined();
  });
});

describe("requireUser", () => {
  it("throws a 401 data response for anonymous requests", () => {
    const context = new RouterContextProvider();
    expect(() => requireUser(context)).toThrow(expect.objectContaining({ init: { status: 401 } }));
  });

  it("returns the context user when signed in", () => {
    const context = new RouterContextProvider();
    const user = { id: "user_1", username: "golfer_1", displayName: "Golfer One" };
    context.set(userContext, user);
    expect(requireUser(context)).toBe(user);
  });
});
