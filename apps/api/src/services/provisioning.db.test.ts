import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "../db/schema";
import { resetMemberData, testDatabase } from "../test/db";
import { ErrorCode } from "./errors";
import { provisionUser, USERNAME_TAKEN } from "./provisioning";

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

  it("refreshes changed fields", async () => {
    await provisionUser(db, "user_1", identity);
    const user = await provisionUser(db, "user_1", { ...identity, displayName: "G. One" });
    expect(user.displayName).toBe("G. One");
  });

  it("keeps a deleted account deleted and untouched", async () => {
    await provisionUser(db, "user_1", identity);
    await db.update(users).set({ deletedAt: new Date(), email: null }).where(eq(users.id, "user_1"));
    await expect(provisionUser(db, "user_1", identity)).rejects.toMatchObject({ status: 401, code: ErrorCode.AccountDeleted });
    const [row] = await db.select().from(users).where(eq(users.id, "user_1"));
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.email).toBeNull();
  });

  it("falls back to the username as display name", async () => {
    const user = await provisionUser(db, "user_1", { ...identity, displayName: "  " });
    expect(user.displayName).toBe("golfer_1");
  });

  it.each([
    ["the same spelling", "golfer_1"],
    ["another case", "GOLFER_1"],
  ])("answers 409 username_taken when another member holds the username in %s", async (_label, username) => {
    await provisionUser(db, "user_1", identity);
    await expect(provisionUser(db, "user_2", { ...identity, username, email: "second@example.com" })).rejects.toMatchObject({
      status: 409,
      code: ErrorCode.UsernameTaken,
      message: USERNAME_TAKEN,
    });
    expect(await db.select({ id: users.id }).from(users)).toEqual([{ id: "user_1" }]);
  });

  it("answers 409 when a member renames themselves to a username another row still holds, until that row changes", async () => {
    await provisionUser(db, "user_1", identity);
    await provisionUser(db, "user_2", { ...identity, username: "golfer_2", email: "second@example.com" });
    // user_1 renamed themselves in Clerk; their row keeps golfer_1 until their next request.
    const rename = { ...identity, username: "golfer_1", email: "second@example.com" };
    await expect(provisionUser(db, "user_2", rename)).rejects.toMatchObject({ status: 409, code: ErrorCode.UsernameTaken });
    await provisionUser(db, "user_1", { ...identity, username: "golfer_renamed" });
    expect(await provisionUser(db, "user_2", rename)).toMatchObject({ id: "user_2", username: "golfer_1" });
  });

  it("reports a deleted account as deleted even when its username is now someone else's", async () => {
    await provisionUser(db, "user_1", identity);
    await provisionUser(db, "user_2", { ...identity, username: "golfer_2" });
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, "user_2"));
    await expect(provisionUser(db, "user_2", identity)).rejects.toMatchObject({ status: 401, code: ErrorCode.AccountDeleted });
  });

  it("lets a member keep their own username in another case", async () => {
    await provisionUser(db, "user_1", identity);
    expect(await provisionUser(db, "user_1", { ...identity, username: "Golfer_1" })).toMatchObject({ username: "Golfer_1" });
  });

  it("rejects usernames outside the product rule with a 403 AppError", async () => {
    await expect(
      provisionUser(db, "user_1", { ...identity, username: "bad-name" }),
    ).rejects.toMatchObject({ status: 403, code: ErrorCode.UsernameInvalid });
    expect(await db.select().from(users)).toHaveLength(0);
  });
});
