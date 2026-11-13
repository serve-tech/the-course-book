import { MemberRole } from "@coursebook/domain/curation/types";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "../../src/db/schema";
import { resetMemberData, testDatabase } from "../../src/test/db";
import { assignRole, parseRole } from "./assign";

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
  await db.insert(users).values([
    { id: "user_josh", username: "Josh", displayName: "Josh" },
    { id: "user_gone", username: "gone", displayName: "Gone", deletedAt: new Date() },
  ]);
});

describe("assignRole", () => {
  it("makes an active member an admin, matching the username in any case", async () => {
    await expect(assignRole(db, "josh", MemberRole.Admin)).resolves.toEqual({ username: "Josh", from: MemberRole.Member, to: MemberRole.Admin });
    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, "user_josh"));
    expect(row?.role).toBe(MemberRole.Admin);
  });

  it.each(["nobody", "gone"])("finds no active member called %s", async (username) => {
    await expect(assignRole(db, username, MemberRole.Admin)).resolves.toBeNull();
  });
});

describe("parseRole", () => {
  it.each([
    ["admin", MemberRole.Admin],
    [" Curator ", MemberRole.Curator],
    ["member", MemberRole.Member],
    ["owner", null],
    [undefined, null],
  ])("reads %s as %s", (value, expected) => {
    expect(parseRole(value)).toBe(expected);
  });
});
