/**
 * Database access for browser tests: fixture courses and member data in the
 * test database the app server is pointed at.
 */
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { createDatabase } from "@coursebook/api/db/client";
import { courses, friendships, rounds, userCourses, users, wantToPlay } from "@coursebook/api/db/schema";
import { FriendshipStatus } from "@coursebook/api/domain/friendship";
import { normalizeName } from "@coursebook/domain/catalog/course";

export const TEST_DATABASE_URL =
  process.env["DATABASE_URL_TEST"] ??
  "postgres://coursebook:coursebook@localhost:5433/coursebook_test";

export const fixtureCourses = {
  alpha: { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Test Alpha Links" },
  beta: { id: "aaaaaaaa-0000-4000-8000-000000000002", name: "Test Beta Links" },
  gamma: { id: "aaaaaaaa-0000-4000-8000-000000000003", name: "Test Gamma Links" },
} as const;

export interface TestMember {
  id: string;
  username: string;
  displayName: string;
  email: string;
}

export function connect() {
  return createDatabase(TEST_DATABASE_URL);
}

/** Insert the fixture courses (Detroit, MI) if missing. */
export async function ensureFixtureCourses(db: ReturnType<typeof connect>["db"]): Promise<void> {
  await db
    .insert(courses)
    .values(
      Object.values(fixtureCourses).map((course) => ({
        id: course.id,
        name: course.name,
        nameKey: normalizeName(course.name),
        city: "Detroit",
        state: "MI",
        country: "USA",
      })),
    )
    .onConflictDoNothing();
}

/**
 * Delete every member except the given ones, with the courses they created.
 *
 * The Vitest database suites share this database and leave their last test's
 * members behind; the Friends scenarios search the whole membership.
 * Courses go first because deleting a user nulls `created_by`, after which
 * they could no longer be identified.
 */
export async function removeOtherMembers(
  db: ReturnType<typeof connect>["db"],
  members: readonly TestMember[],
): Promise<void> {
  const ids = sql.join(members.map((member) => sql`${member.id}`), sql`, `);
  await db.delete(courses).where(sql`${courses.createdBy} is not null and ${courses.createdBy} not in (${ids})`);
  await db.delete(users).where(sql`${users.id} not in (${ids})`);
}

/** Upsert the two test members' rows so directory and provisioning agree. */
export async function ensureMembers(
  db: ReturnType<typeof connect>["db"],
  members: readonly TestMember[],
): Promise<void> {
  for (const member of members) {
    await db
      .insert(users)
      .values({ id: member.id, username: member.username, displayName: member.displayName, email: member.email })
      .onConflictDoUpdate({
        target: users.id,
        set: { username: member.username, displayName: member.displayName, email: member.email, deletedAt: null },
      });
  }
}

/**
 * Reset both members to the baseline scenario: they are friends; the owner
 * has Beta at rank 1 and Alpha at rank 2 with one round each; the friend has
 * Alpha then Gamma. Neither wants to play anything.
 */
export async function resetScenario(
  db: ReturnType<typeof connect>["db"],
  owner: TestMember,
  friend: TestMember,
): Promise<void> {
  const ids = [owner.id, friend.id];
  await db.delete(wantToPlay).where(inArray(wantToPlay.userId, ids));
  await db.delete(friendships).where(or(inArray(friendships.requesterId, ids), inArray(friendships.addresseeId, ids)));
  await db.insert(friendships).values({ requesterId: owner.id, addresseeId: friend.id, status: FriendshipStatus.Accepted });
  await db.delete(rounds).where(inArray(rounds.userId, ids));
  await db.delete(userCourses).where(inArray(userCourses.userId, ids));
  await db.delete(courses).where(sql`${courses.createdBy} = any(array[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::text[])`);
  await db.insert(userCourses).values([
    { userId: owner.id, courseId: fixtureCourses.beta.id, personalRank: 1 },
    { userId: owner.id, courseId: fixtureCourses.alpha.id, personalRank: 2 },
    { userId: friend.id, courseId: fixtureCourses.alpha.id, personalRank: 1 },
    { userId: friend.id, courseId: fixtureCourses.gamma.id, personalRank: 2 },
  ]);
  await db.insert(rounds).values([
    { userId: owner.id, courseId: fixtureCourses.alpha.id, playedAt: "2026-01-01" },
    { userId: owner.id, courseId: fixtureCourses.beta.id, playedAt: "2026-02-01" },
    { userId: friend.id, courseId: fixtureCourses.alpha.id },
    { userId: friend.id, courseId: fixtureCourses.gamma.id },
  ]);
}

/** The friendship row between two members, whoever asked. */
const between = (a: TestMember, b: TestMember) =>
  or(
    and(eq(friendships.requesterId, a.id), eq(friendships.addresseeId, b.id)),
    and(eq(friendships.requesterId, b.id), eq(friendships.addresseeId, a.id)),
  );

/** Delete the friendship or request between two members, if any. */
export async function unfriend(db: ReturnType<typeof connect>["db"], a: TestMember, b: TestMember): Promise<void> {
  await db.delete(friendships).where(between(a, b));
}

/** The status of the friendship row between two members; null without one. */
export async function friendshipStatus(
  db: ReturnType<typeof connect>["db"],
  a: TestMember,
  b: TestMember,
): Promise<FriendshipStatus | null> {
  const [row] = await db.select({ status: friendships.status }).from(friendships).where(between(a, b));
  return row?.status ?? null;
}

/** Ordered course ids on a member's list. */
export async function listOrder(db: ReturnType<typeof connect>["db"], userId: string): Promise<string[]> {
  const rows = await db
    .select({ courseId: userCourses.courseId })
    .from(userCourses)
    .where(eq(userCourses.userId, userId))
    .orderBy(userCourses.personalRank);
  return rows.map((row) => row.courseId);
}

/** A course row by name, for asserting hand-entered courses. */
export async function courseByName(db: ReturnType<typeof connect>["db"], name: string) {
  const [row] = await db.select().from(courses).where(eq(courses.nameKey, normalizeName(name)));
  return row;
}

/** Add a third membership for the owner (used by the drag scenario). */
export async function addHiddenCourse(db: ReturnType<typeof connect>["db"], owner: TestMember): Promise<void> {
  await db
    .insert(courses)
    .values({
      id: "aaaaaaaa-0000-4000-8000-000000000004",
      name: "Hidden Course",
      nameKey: normalizeName("Hidden Course"),
      city: "Dundee",
      country: "Scotland",
    })
    .onConflictDoNothing();
  await db.insert(userCourses).values({ userId: owner.id, courseId: "aaaaaaaa-0000-4000-8000-000000000004", personalRank: 3 });
}

/** A seeded catalog course's id by its stable id (e.g. `usa4`, Shinnecock Hills). */
export async function catalogCourse(db: ReturnType<typeof connect>["db"], stableId: string): Promise<string> {
  const [row] = await db.select({ id: courses.id }).from(courses).where(eq(courses.stableId, stableId));
  if (!row) throw new Error("missing seeded course " + stableId);
  return row.id;
}

/** Put a course at the bottom of a member's list with one round. */
export async function addPlayed(db: ReturnType<typeof connect>["db"], member: TestMember, courseId: string): Promise<void> {
  const ranks = await db.select({ rank: userCourses.personalRank }).from(userCourses).where(eq(userCourses.userId, member.id));
  await db.insert(userCourses).values({ userId: member.id, courseId, personalRank: ranks.length + 1 });
  await db.insert(rounds).values({ userId: member.id, courseId, playedAt: "2026-06-01" });
}

/** Course ids on a member's Want to play list. */
export async function wantedIds(db: ReturnType<typeof connect>["db"], userId: string): Promise<string[]> {
  const rows = await db.select({ courseId: wantToPlay.courseId }).from(wantToPlay).where(eq(wantToPlay.userId, userId));
  return rows.map((row) => row.courseId);
}

/** Dates of a member's rounds at a course. */
export async function roundDates(db: ReturnType<typeof connect>["db"], userId: string, courseId: string): Promise<string[]> {
  const rows = await db
    .select({ playedAt: rounds.playedAt })
    .from(rounds)
    .where(and(eq(rounds.userId, userId), eq(rounds.courseId, courseId)));
  return rows.map((row) => row.playedAt).sort();
}
