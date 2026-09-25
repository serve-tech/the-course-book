import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database, Executor, Transaction } from "../db/client";
import { courses, rounds, userCourses, users } from "../db/schema";
import { courseView } from "../domain/course-view";
import { insertAt, reorder } from "@coursebook/domain/journal/reorder";
import type { ListEntry, ListSummary, RoundEntry } from "@coursebook/domain/journal/types";
import {
  findOrCreateCourse,
  invalidateCatalog,
  rankedViews,
  requireCourse,
  type CourseInput,
} from "./catalog";
import { AppError, ErrorCode } from "./errors";

/**
 * Journal transactions: memberships (a member's personal list) and rounds.
 *
 * Every mutation runs inside `withJournalLock`, one transaction holding a
 * per-user advisory lock, so concurrent moves and logs serialize. Ranks are
 * contiguous 1..N per user; `renumber` keeps that invariant after any
 * insertion, move or removal. Play counts are always counted from rounds.
 */

/** Play counts and list membership for a member; empty for anonymous users. */
export async function listSummary(db: Database, userId: string): Promise<ListSummary> {
  const [memberships, counts] = await Promise.all([
    db
      .select({ courseId: userCourses.courseId })
      .from(userCourses)
      .where(eq(userCourses.userId, userId))
      .orderBy(userCourses.personalRank),
    db
      .select({ courseId: rounds.courseId, played: count() })
      .from(rounds)
      .where(eq(rounds.userId, userId))
      .groupBy(rounds.courseId),
  ]);
  return {
    played: Object.fromEntries(counts.map((row) => [row.courseId, row.played])),
    onList: memberships.map((row) => row.courseId),
  };
}

/** The member's personal list in rank order with play counts. */
export async function personalList(db: Executor, userId: string): Promise<ListEntry[]> {
  const playedRows = db
    .select({ courseId: rounds.courseId, played: count().as("played") })
    .from(rounds)
    .where(eq(rounds.userId, userId))
    .groupBy(rounds.courseId)
    .as("played_rows");
  const rows = await db
    .select({
      course: courses,
      rank: userCourses.personalRank,
      // bigint comes back as a string from pg.
      played: sql<string>`coalesce(${playedRows.played}, 0)`,
    })
    .from(userCourses)
    .innerJoin(courses, eq(courses.id, userCourses.courseId))
    .leftJoin(playedRows, eq(playedRows.courseId, userCourses.courseId))
    .where(eq(userCourses.userId, userId))
    .orderBy(userCourses.personalRank);
  const views = await rankedViews(db, rows.map((row) => row.course));
  return rows.map((row) => ({
    course: views.get(row.course.id) ?? courseView(row.course),
    rank: row.rank,
    played: Number(row.played),
  }));
}

/** Rounds for one course, newest first. */
export async function roundHistory(
  db: Database,
  userId: string,
  courseId: string,
): Promise<RoundEntry[]> {
  const rows = await db
    .select({ id: rounds.id, playedAt: rounds.playedAt })
    .from(rounds)
    .where(and(eq(rounds.userId, userId), eq(rounds.courseId, courseId)))
    .orderBy(desc(rounds.playedAt), desc(rounds.createdAt));
  return rows;
}

/**
 * Run `work` in one transaction that holds the member's journal lock.
 *
 * Account deletion takes the same lock, so after acquiring it a deleted
 * account is rejected: a request that raced the deletion cannot recreate
 * rows for it.
 *
 * Raises:
 *     AppError: 401 `account_deleted` when the account was deleted.
 */
export function withJournalLock<T>(
  db: Database,
  userId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [account] = await tx
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, userId));
    if (account?.deletedAt) throw new AppError(401, ErrorCode.AccountDeleted, "This account was deleted.");
    return work(tx);
  });
}

async function orderedCourseIds(tx: Transaction, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ courseId: userCourses.courseId })
    .from(userCourses)
    .where(eq(userCourses.userId, userId))
    .orderBy(userCourses.personalRank, userCourses.id)
    .for("update");
  return rows.map((row) => row.courseId);
}

/** SQL array literal from parameters (drizzle expands a JS array into a row). */
const sqlArray = (values: readonly (string | number)[], type: string) =>
  sql`array[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::${sql.raw(type)}[]`;

/** Write ranks 1..N for `order` in one statement; the unique check is deferred to commit. */
async function renumber(tx: Transaction, userId: string, order: readonly string[]): Promise<void> {
  if (!order.length) return;
  const ranks = order.map((_, index) => index + 1);
  await tx.execute(sql`
    update user_courses as m
    set personal_rank = v.rank, updated_at = now()
    from unnest(${sqlArray(order, "uuid")}, ${sqlArray(ranks, "int")}) as v(course_id, rank)
    where m.user_id = ${userId} and m.course_id = v.course_id
  `);
}

/** Insert `quantity` rounds sharing one played date; returns their ids. */
export async function insertRounds(
  tx: Transaction,
  userId: string,
  courseId: string,
  quantity: number,
  playedAt?: string,
): Promise<string[]> {
  if (quantity < 1) return [];
  const inserted = await tx
    .insert(rounds)
    .values(
      Array.from({ length: quantity }, () => ({
        userId,
        courseId,
        ...(playedAt ? { playedAt } : {}),
      })),
    )
    .returning({ id: rounds.id });
  return inserted.map((row) => row.id);
}

/** Number of rounds for one course. */
export async function roundCount(
  tx: Transaction,
  userId: string,
  courseId: string,
): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(rounds)
    .where(and(eq(rounds.userId, userId), eq(rounds.courseId, courseId)));
  return row?.n ?? 0;
}

async function membershipRank(
  tx: Transaction,
  userId: string,
  courseId: string,
): Promise<number | undefined> {
  const [row] = await tx
    .select({ rank: userCourses.personalRank })
    .from(userCourses)
    .where(and(eq(userCourses.userId, userId), eq(userCourses.courseId, courseId)));
  return row?.rank;
}

/**
 * Ensure a membership exists, appending it at the bottom of the list when
 * missing. Never changes an existing membership's rank.
 */
export async function ensureMembership(
  tx: Transaction,
  userId: string,
  courseId: string,
): Promise<{ created: boolean; rank: number }> {
  const existing = await membershipRank(tx, userId, courseId);
  if (existing !== undefined) return { created: false, rank: existing };
  const [bottom] = await tx
    .select({ max: sql<number>`coalesce(max(${userCourses.personalRank}), 0)` })
    .from(userCourses)
    .where(eq(userCourses.userId, userId));
  const rank = (bottom?.max ?? 0) + 1;
  await tx.insert(userCourses).values({ userId, courseId, personalRank: rank });
  return { created: true, rank };
}

/** Delete a membership (rounds cascade) and close the gap in the ranks. */
async function removeMembership(tx: Transaction, userId: string, courseId: string): Promise<void> {
  await tx
    .delete(userCourses)
    .where(and(eq(userCourses.userId, userId), eq(userCourses.courseId, courseId)));
  await renumber(tx, userId, await orderedCourseIds(tx, userId));
}

/**
 * Log rounds from the Log Round dialog: resolve or create the course, add
 * the membership at the bottom if missing, insert `quantity` rounds sharing
 * one played date. An existing membership keeps its rank.
 */
export async function logRounds(
  db: Database,
  userId: string,
  input: CourseInput,
  quantity: number,
  playedAt?: string,
): Promise<{ courseId: string; count: number; courses: ListEntry[] }> {
  const count = Math.max(1, quantity);
  if (!("courseId" in input)) {
    const added = await addCourseByDetails(db, userId, input, { rank: null, quantity: count, playedOn: playedAt });
    return { courseId: added.courseId, count, courses: added.courses };
  }
  return withJournalLock(db, userId, async (tx) => {
    const courseId = await requireCourse(tx, input.courseId);
    await ensureMembership(tx, userId, courseId);
    const inserted = await insertRounds(tx, userId, courseId, count, playedAt);
    return { courseId, count: inserted.length, courses: await personalList(tx, userId) };
  });
}

/**
 * Add a course described by its details: resolve or create the catalog row,
 * put it on the list at `rank` if it is not there yet (clamped to [1, N+1],
 * bottom when null; an existing membership keeps its rank), and log
 * `quantity` rounds on `playedOn`.
 *
 * This is both "log a searched course" (`isCustom` false, bottom) and "add a
 * hand-entered course" (`isCustom` true, requested rank).
 *
 * Args:
 *     db: Database handle.
 *     userId: The acting member.
 *     input: Course details; `isCustom` marks hand-entered courses.
 *     options: `rank` for a new membership, `quantity` (at least 1) and an
 *         optional ISO `playedOn` date (database date when absent).
 *
 * Returns:
 *     The course id, its rank on the list and the whole updated list.
 */
export async function addCourseByDetails(
  db: Database,
  userId: string,
  input: Exclude<CourseInput, { courseId: string }>,
  options: { rank: number | null; quantity: number; playedOn?: string | undefined },
): Promise<{ courseId: string; rank: number; courses: ListEntry[] }> {
  const result = await withJournalLock(db, userId, async (tx) => {
    const course = await findOrCreateCourse(tx, input, userId);
    let rank = await membershipRank(tx, userId, course.id);
    if (rank === undefined) {
      await ensureMembership(tx, userId, course.id);
      const order = insertAt(await orderedCourseIds(tx, userId), course.id, options.rank);
      await renumber(tx, userId, order);
      rank = order.indexOf(course.id) + 1;
    }
    await insertRounds(tx, userId, course.id, Math.max(1, options.quantity), options.playedOn);
    return { courseId: course.id, rank, created: course.created, courses: await personalList(tx, userId) };
  });
  if (result.created) invalidateCatalog();
  return { courseId: result.courseId, rank: result.rank, courses: result.courses };
}

/**
 * "Add to my list" for a catalog course, from any client: add the
 * membership at the bottom if missing and log one round when the course has
 * none. Adding twice is harmless.
 *
 * Returns:
 *     Whether a membership was created, and the updated list.
 */
export async function addToList(
  db: Database,
  userId: string,
  courseId: string,
  playedOn?: string,
): Promise<{ added: boolean; courses: ListEntry[] }> {
  return withJournalLock(db, userId, async (tx) => {
    await requireCourse(tx, courseId);
    const { created } = await ensureMembership(tx, userId, courseId);
    if ((await roundCount(tx, userId, courseId)) === 0) await insertRounds(tx, userId, courseId, 1, playedOn);
    return { added: created, courses: await personalList(tx, userId) };
  });
}

/**
 * "Add to my list" from the Rankings page: add the membership if missing and
 * log one round only when the course has none yet.
 */
export async function addFromRankings(db: Database, userId: string, courseId: string): Promise<void> {
  await withJournalLock(db, userId, async (tx) => {
    await requireCourse(tx, courseId);
    await ensureMembership(tx, userId, courseId);
    if ((await roundCount(tx, userId, courseId)) === 0) await insertRounds(tx, userId, courseId, 1);
  });
}

/** "Add to my list" from a member's page: no-op when already on the list. */
export async function addFromFriend(
  db: Database,
  userId: string,
  courseId: string,
): Promise<{ added: boolean }> {
  return withJournalLock(db, userId, async (tx) => {
    await requireCourse(tx, courseId);
    const { created } = await ensureMembership(tx, userId, courseId);
    if (created) await insertRounds(tx, userId, courseId, 1);
    return { added: created };
  });
}

/**
 * Add a hand-entered course at a requested rank (clamped to [1, N+1],
 * default bottom) and log one round. If the member already has the course,
 * its rank is kept and one round is still logged.
 */
export async function addCustomCourse(
  db: Database,
  userId: string,
  input: Exclude<CourseInput, { courseId: string }>,
  requestedRank: number | null,
): Promise<{ courseId: string; rank: number; courses: ListEntry[] }> {
  return addCourseByDetails(db, userId, { ...input, isCustom: true }, { rank: requestedRank, quantity: 1 });
}

/** Move a course to a rank; the whole list is renumbered from its full order. */
export async function moveCourse(
  db: Database,
  userId: string,
  courseId: string,
  rank: number,
): Promise<{ rank: number; courses: ListEntry[] }> {
  return withJournalLock(db, userId, async (tx) => {
    const ids = await orderedCourseIds(tx, userId);
    if (!ids.includes(courseId)) throw new AppError(404, ErrorCode.NotOnList, "That course is not on your list.");
    const order = reorder(ids, courseId, rank);
    await renumber(tx, userId, order);
    return { rank: order.indexOf(courseId) + 1, courses: await personalList(tx, userId) };
  });
}

/**
 * Set the play count by diffing against the rounds: the oldest surplus
 * rounds are removed (newest history is kept) or missing rounds inserted.
 * Zero removes the course from the list.
 */
export async function setCount(
  db: Database,
  userId: string,
  courseId: string,
  requested: number,
): Promise<{ count: number; removed: boolean; courses: ListEntry[] }> {
  return withJournalLock(db, userId, async (tx) => {
    if ((await membershipRank(tx, userId, courseId)) === undefined)
      throw new AppError(404, ErrorCode.NotOnList, "That course is not on your list.");
    const target = Math.max(0, Math.floor(requested));
    if (target === 0) {
      await removeMembership(tx, userId, courseId);
      return { count: 0, removed: true, courses: await personalList(tx, userId) };
    }
    const existing = await tx
      .select({ id: rounds.id })
      .from(rounds)
      .where(and(eq(rounds.userId, userId), eq(rounds.courseId, courseId)))
      .orderBy(desc(rounds.playedAt), desc(rounds.createdAt));
    if (existing.length > target) {
      const surplus = existing.slice(target).map((row) => row.id);
      await tx
        .delete(rounds)
        .where(and(eq(rounds.userId, userId), inArray(rounds.id, surplus)));
    } else if (existing.length < target) {
      await insertRounds(tx, userId, courseId, target - existing.length);
    }
    return { count: target, removed: false, courses: await personalList(tx, userId) };
  });
}

/** Delete one round; deleting the last round for a course removes the course. */
export async function deleteRound(
  db: Database,
  userId: string,
  roundId: string,
): Promise<{ removedCourse: boolean; courseId: string; courses: ListEntry[] }> {
  return withJournalLock(db, userId, async (tx) => {
    const [round] = await tx
      .select({ courseId: rounds.courseId })
      .from(rounds)
      .where(and(eq(rounds.userId, userId), eq(rounds.id, roundId)));
    if (!round) throw new AppError(404, ErrorCode.RoundNotFound, "That round no longer exists.");
    await tx.delete(rounds).where(and(eq(rounds.userId, userId), eq(rounds.id, roundId)));
    const remaining = await roundCount(tx, userId, round.courseId);
    if (remaining === 0) await removeMembership(tx, userId, round.courseId);
    return { removedCourse: remaining === 0, courseId: round.courseId, courses: await personalList(tx, userId) };
  });
}

/** Remove a course from the list along with all its rounds. */
export async function deleteCourse(
  db: Database,
  userId: string,
  courseId: string,
): Promise<{ courses: ListEntry[] }> {
  return withJournalLock(db, userId, async (tx) => {
    if ((await membershipRank(tx, userId, courseId)) === undefined)
      throw new AppError(404, ErrorCode.NotOnList, "That course is not on your list.");
    await removeMembership(tx, userId, courseId);
    return { courses: await personalList(tx, userId) };
  });
}
