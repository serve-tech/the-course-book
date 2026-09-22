import { and, count, eq, sql } from "drizzle-orm";
import type { Database, Transaction } from "../db/client";
import { rounds, userCourses } from "../db/schema";
import { requireCourse } from "./catalog.server";

/**
 * Journal transactions: memberships (a member's personal list) and rounds.
 *
 * Every mutation runs inside `withJournalLock`, one transaction holding a
 * per-user advisory lock, so concurrent moves and logs serialize. Ranks are
 * contiguous 1..N per user; helpers here keep that invariant.
 */

export interface ListSummary {
  /** Round count per course id (only courses with at least one round). */
  played: Record<string, number>;
  /** Course ids on the member's list, in rank order. */
  onList: string[];
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

/**
 * Ensure a membership exists, appending it at the bottom of the list when
 * missing. Never changes an existing membership's rank.
 */
export async function ensureMembership(
  tx: Transaction,
  userId: string,
  courseId: string,
): Promise<{ created: boolean }> {
  const [existing] = await tx
    .select({ id: userCourses.id })
    .from(userCourses)
    .where(and(eq(userCourses.userId, userId), eq(userCourses.courseId, courseId)));
  if (existing) return { created: false };
  const [bottom] = await tx
    .select({ max: sql<number>`coalesce(max(${userCourses.personalRank}), 0)` })
    .from(userCourses)
    .where(eq(userCourses.userId, userId));
  await tx.insert(userCourses).values({
    userId,
    courseId,
    personalRank: (bottom?.max ?? 0) + 1,
  });
  return { created: true };
}

/**
 * "Add to my list" from the Rankings page: add the membership if missing and
 * log one round only when the course has none yet.
 */
export async function addFromRankings(
  db: Database,
  userId: string,
  courseId: string,
): Promise<void> {
  await withJournalLock(db, userId, async (tx) => {
    await requireCourse(tx, courseId);
    await ensureMembership(tx, userId, courseId);
    if ((await roundCount(tx, userId, courseId)) === 0)
      await insertRounds(tx, userId, courseId, 1);
  });
}
