import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database, Executor, Transaction } from "../db/client";
import { courses, rounds, userCourses } from "../db/schema";
import type { Course } from "../features/catalog/course";
import { courseView } from "../features/catalog/course-view";
import { insertAt, reorder } from "../features/journal/reorder";
import {
  findOrCreateCourse,
  invalidateCatalog,
  requireCourse,
  type CourseInput,
} from "./catalog.server";
import { AppError, ErrorCode } from "./errors.server";

/**
 * Journal transactions: memberships (a member's personal list) and rounds.
 *
 * Every mutation runs inside `withJournalLock`, one transaction holding a
 * per-user advisory lock, so concurrent moves and logs serialize. Ranks are
 * contiguous 1..N per user; `renumber` keeps that invariant after any
 * insertion, move or removal. Play counts are always counted from rounds.
 */

export interface ListSummary {
  /** Round count per course id (only courses with at least one round). */
  played: Record<string, number>;
  /** Course ids on the member's list, in rank order. */
  onList: string[];
}

export interface ListEntry {
  course: Course;
  rank: number;
  played: number;
}

export interface RoundEntry {
  id: string;
  playedAt: string;
}

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
  return rows.map((row) => ({
    course: courseView(row.course),
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

/** Run `work` in one transaction that holds the member's journal lock. */
export function withJournalLock<T>(
  db: Database,
  userId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
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
): Promise<{ courseId: string; count: number }> {
  const result = await withJournalLock(db, userId, async (tx) => {
    const course = await findOrCreateCourse(tx, input, userId);
    await ensureMembership(tx, userId, course.id);
    const inserted = await insertRounds(tx, userId, course.id, Math.max(1, quantity), playedAt);
    return { courseId: course.id, count: inserted.length, created: course.created };
  });
  if (result.created) invalidateCatalog();
  return { courseId: result.courseId, count: result.count };
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
): Promise<{ courseId: string; rank: number }> {
  const result = await withJournalLock(db, userId, async (tx) => {
    const course = await findOrCreateCourse(tx, { ...input, isCustom: true }, userId);
    const courseId = course.id;
    const existing = await membershipRank(tx, userId, courseId);
    let rank = existing;
    if (rank === undefined) {
      await ensureMembership(tx, userId, courseId);
      const order = insertAt(await orderedCourseIds(tx, userId), courseId, requestedRank);
      await renumber(tx, userId, order);
      rank = order.indexOf(courseId) + 1;
    }
    await insertRounds(tx, userId, courseId, 1);
    return { courseId, rank, created: course.created };
  });
  if (result.created) invalidateCatalog();
  return { courseId: result.courseId, rank: result.rank };
}

/** Move a course to a rank; the whole list is renumbered from its full order. */
export async function moveCourse(
  db: Database,
  userId: string,
  courseId: string,
  rank: number,
): Promise<{ rank: number }> {
  return withJournalLock(db, userId, async (tx) => {
    const ids = await orderedCourseIds(tx, userId);
    if (!ids.includes(courseId)) throw new AppError(404, ErrorCode.NotOnList, "That course is not on your list.");
    const order = reorder(ids, courseId, rank);
    await renumber(tx, userId, order);
    return { rank: order.indexOf(courseId) + 1 };
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
): Promise<{ count: number; removed: boolean }> {
  return withJournalLock(db, userId, async (tx) => {
    if ((await membershipRank(tx, userId, courseId)) === undefined)
      throw new AppError(404, ErrorCode.NotOnList, "That course is not on your list.");
    const target = Math.max(0, Math.floor(requested));
    if (target === 0) {
      await removeMembership(tx, userId, courseId);
      return { count: 0, removed: true };
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
    return { count: target, removed: false };
  });
}

/** Delete one round; deleting the last round for a course removes the course. */
export async function deleteRound(
  db: Database,
  userId: string,
  roundId: string,
): Promise<{ removedCourse: boolean; courseId: string }> {
  return withJournalLock(db, userId, async (tx) => {
    const [round] = await tx
      .select({ courseId: rounds.courseId })
      .from(rounds)
      .where(and(eq(rounds.userId, userId), eq(rounds.id, roundId)));
    if (!round) throw new AppError(404, ErrorCode.RoundNotFound, "That round no longer exists.");
    await tx.delete(rounds).where(and(eq(rounds.userId, userId), eq(rounds.id, roundId)));
    const remaining = await roundCount(tx, userId, round.courseId);
    if (remaining === 0) await removeMembership(tx, userId, round.courseId);
    return { removedCourse: remaining === 0, courseId: round.courseId };
  });
}

/** Remove a course from the list along with all its rounds. */
export async function deleteCourse(db: Database, userId: string, courseId: string): Promise<void> {
  await withJournalLock(db, userId, async (tx) => {
    if ((await membershipRank(tx, userId, courseId)) === undefined)
      throw new AppError(404, ErrorCode.NotOnList, "That course is not on your list.");
    await removeMembership(tx, userId, courseId);
  });
}
