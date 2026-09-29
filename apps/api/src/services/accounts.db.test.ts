import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { courses, rounds, userCourses, users } from "../db/schema";
import { resetMemberData, testDatabase } from "../test/db";
import { deleteAccountData } from "./accounts";
import { ErrorCode } from "./errors";
import { members } from "./friends";
import { addCourseByDetails, logRounds, moveCourse } from "./journal";

const { db, pool } = testDatabase();
const USER = "user_del";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
  await db.insert(users).values([
    { id: USER, username: "leaving", displayName: "Leaving", email: "leaving@example.com", avatarUrl: "https://img/x" },
    { id: "user_other", username: "staying", displayName: "Staying" },
  ]);
});

const seeded = async (stableId: string) => {
  const [row] = await db.select({ id: courses.id }).from(courses).where(eq(courses.stableId, stableId));
  if (!row) throw new Error("missing " + stableId);
  return row.id;
};

const custom = { name: "Backyard Nine", location: "Hometown, OH, USA", city: "Hometown", state: "OH", country: "USA", logo: "", website: "", isCustom: true };

describe("account deletion", () => {
  it("removes the list and rounds, keeps created courses, and tombstones the member", async () => {
    await logRounds(db, USER, { courseId: await seeded("usa1") }, 2);
    const { courseId: customId } = await addCourseByDetails(db, USER, custom, { rank: null, quantity: 1 });
    await logRounds(db, "user_other", { courseId: customId }, 1);

    await deleteAccountData(db, USER);

    expect(await db.select().from(userCourses).where(eq(userCourses.userId, USER))).toHaveLength(0);
    expect(await db.select().from(rounds).where(eq(rounds.userId, USER))).toHaveLength(0);
    const [course] = await db.select().from(courses).where(eq(courses.id, customId));
    expect(course).toMatchObject({ createdBy: null, name: "Backyard Nine" });
    expect(await db.select().from(userCourses).where(eq(userCourses.userId, "user_other"))).toHaveLength(1);
    const [row] = await db.select().from(users).where(eq(users.id, USER));
    expect(row).toMatchObject({ displayName: "Deleted member", email: null, avatarUrl: null, legacySupabaseId: null });
    expect(row?.username).toMatch(/^deleted_[0-9a-f]{16}$/);
    expect(row?.deletedAt).not.toBeNull();
    expect(await members(db, "user_other")).toEqual([]);
  });

  it("rejects list changes for a deleted account", async () => {
    const courseId = await seeded("usa1");
    await logRounds(db, USER, { courseId }, 1);
    await deleteAccountData(db, USER);
    await expect(logRounds(db, USER, { courseId }, 1)).rejects.toMatchObject({ status: 401, code: ErrorCode.AccountDeleted });
    await expect(moveCourse(db, USER, courseId, 1)).rejects.toMatchObject({ status: 401, code: ErrorCode.AccountDeleted });
    expect(await db.select().from(userCourses).where(eq(userCourses.userId, USER))).toHaveLength(0);
  });

  it("rejects deleting an account twice", async () => {
    await deleteAccountData(db, USER);
    await expect(deleteAccountData(db, USER)).rejects.toMatchObject({ code: ErrorCode.AccountDeleted });
  });

  it("serializes with a concurrent list change", async () => {
    const courseId = await seeded("usa1");
    await logRounds(db, USER, { courseId }, 1);
    const results = await Promise.allSettled([deleteAccountData(db, USER), logRounds(db, USER, { courseId }, 1)]);
    expect(results[0].status).toBe("fulfilled");
    // Whichever ran first, the deleted account ends with no data.
    expect(await db.select().from(rounds).where(eq(rounds.userId, USER))).toHaveLength(0);
    expect(await db.select().from(userCourses).where(eq(userCourses.userId, USER))).toHaveLength(0);
  });
});
