import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Database, Executor, Transaction } from "../db/client";
import { courses, rounds, userCourses, wantToPlay } from "../db/schema";
import { courseView } from "../domain/course-view";
import { splitList } from "../domain/personal-list";
import { placeInRanking } from "@coursebook/domain/journal/reorder";
import type { ListEntry, PersonalList, RoundEntry } from "@coursebook/domain/journal/types";
import {
  findOrCreateCourse,
  invalidateCatalog,
  rankedViews,
  requireCourse,
  type CourseInput,
} from "./catalog";
import { AppError, ErrorCode } from "./errors";
import { lockMembers } from "./member-lock";

/**
 * Journal transactions: a member's list (memberships) and rounds.
 *
 * A course on the list is Ranked (it has a personal rank) or Played (it has
 * none; #52). Every mutation runs inside `withJournalLock`, one transaction
 * holding a per-user advisory lock, so concurrent moves and logs serialize.
 * Ranks are contiguous 1..N over the Ranked courses only; `renumber` keeps
 * that after any insertion, move or removal and never touches a Played
 * course. Play counts are always counted from rounds.
 */

/**
 * The member's whole list: the ranking in rank order and the Played
 * courses, most recently Played first, each with its play count. Both come
 * from one read, so they never disagree.
 */
export async function wholeList(db: Executor, userId: string): Promise<PersonalList> {
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
      updatedAt: userCourses.updatedAt,
      // bigint comes back as a string from pg.
      played: sql<string>`coalesce(${playedRows.played}, 0)`,
    })
    .from(userCourses)
    .innerJoin(courses, eq(courses.id, userCourses.courseId))
    .leftJoin(playedRows, eq(playedRows.courseId, userCourses.courseId))
    .where(eq(userCourses.userId, userId));
  const views = await rankedViews(db, rows.map((row) => row.course));
  const view = (row: (typeof rows)[number]) => views.get(row.course.id) ?? courseView(row.course);
  const { ranked, unranked } = splitList(rows);
  return {
    courses: ranked.map((row) => ({ course: view(row), rank: row.rank, played: Number(row.played) })),
    unranked: unranked.map((row) => ({ course: view(row), played: Number(row.played) })),
  };
}

/** The member's ranking in rank order with play counts: Ranked courses only. */
export async function personalList(db: Executor, userId: string): Promise<ListEntry[]> {
  return (await wholeList(db, userId)).courses;
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
 * Run `work` in one transaction that holds the member's lock (member-lock.ts).
 *
 * Account deletion and friendship changes take the same lock, so after
 * acquiring it a deleted account is rejected: a request that raced the
 * deletion cannot recreate rows for it.
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
    const [account] = await lockMembers(tx, [userId]);
    if (account?.deletedAt) throw new AppError(401, ErrorCode.AccountDeleted, "This account was deleted.");
    return work(tx);
  });
}

/** The member's ranking as course ids in rank order, locked for update. Played courses are not in it. */
async function rankingIds(tx: Transaction, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ courseId: userCourses.courseId })
    .from(userCourses)
    .where(and(eq(userCourses.userId, userId), isNotNull(userCourses.personalRank)))
    .orderBy(userCourses.personalRank, userCourses.id)
    .for("update");
  return rows.map((row) => row.courseId);
}

/** SQL array literal from parameters (drizzle expands a JS array into a row). */
const sqlArray = (values: readonly (string | number)[], type: string) =>
  sql`array[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::${sql.raw(type)}[]`;

/**
 * Write ranks 1..N for `order` in one statement; the unique check is
 * deferred to commit. `order` must be the whole ranking: rows not in it are
 * left alone, which is what keeps Played courses unranked.
 */
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

/**
 * Insert `quantity` rounds sharing one played date; returns their ids.
 * Playing a course takes it off the member's Want to play list.
 */
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
  await tx.delete(wantToPlay).where(and(eq(wantToPlay.userId, userId), eq(wantToPlay.courseId, courseId)));
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

/** A course on the member's list: its rank, null when it is Played. */
interface Listing {
  rank: number | null;
}

/** The course's place on the member's list, or null when it is not on it. */
async function listing(tx: Transaction, userId: string, courseId: string): Promise<Listing | null> {
  const [row] = await tx
    .select({ rank: userCourses.personalRank })
    .from(userCourses)
    .where(and(eq(userCourses.userId, userId), eq(userCourses.courseId, courseId)));
  return row ?? null;
}

/**
 * Put a course into the ranking at `rank` (the bottom when null) unless it
 * is already Ranked, adding it to the list first when it is not on it. A
 * Played course is ranked too. This is how the operations that predate
 * Played courses add a course (`addToList`, `addCourse`, `logRounds`): their
 * clients only know the ranking, so a course they add always lands in it.
 *
 * Returns:
 *     Whether the course was added to the list, and its rank afterwards.
 */
async function putInRanking(
  tx: Transaction,
  userId: string,
  courseId: string,
  rank: number | null,
): Promise<{ created: boolean; rank: number }> {
  const current = await listing(tx, userId, courseId);
  if (current?.rank != null) return { created: false, rank: current.rank };
  if (!current) await tx.insert(userCourses).values({ userId, courseId, personalRank: null });
  const ranking = await rankingIds(tx, userId);
  return { created: !current, rank: await rankCourse(tx, userId, courseId, ranking, rank ?? ranking.length + 1) };
}

/**
 * Place a course into the ranking, or move it there if it is Ranked, and
 * record when (`ranked_at`, for #54). The courses this shifts are
 * renumbered but keep their own `ranked_at`: only the course the member
 * placed counts as ranked now.
 *
 * Args:
 *     ranking: The whole ranking as read under the member's lock.
 *     rank: The requested position; clamped by `placeInRanking`.
 *
 * Returns:
 *     The course's rank afterwards.
 */
async function rankCourse(tx: Transaction, userId: string, courseId: string, ranking: readonly string[], rank: number): Promise<number> {
  const order = placeInRanking(ranking, courseId, rank);
  await renumber(tx, userId, order);
  await tx
    .update(userCourses)
    .set({ rankedAt: sql`now()` })
    .where(and(eq(userCourses.userId, userId), eq(userCourses.courseId, courseId)));
  return order.indexOf(courseId) + 1;
}

/** Delete a membership (rounds cascade) and, if it was Ranked, close the gap in the ranks. */
async function removeMembership(tx: Transaction, userId: string, courseId: string): Promise<void> {
  const [removed] = await tx
    .delete(userCourses)
    .where(and(eq(userCourses.userId, userId), eq(userCourses.courseId, courseId)))
    .returning({ rank: userCourses.personalRank });
  if (removed?.rank != null) await renumber(tx, userId, await rankingIds(tx, userId));
}

/**
 * Put a course on the member's list as Played: no rank, no round. A course
 * already on the list, Ranked or Played, is left alone. A course that joins
 * the list comes off Want to play, as it does when a round is logged there.
 *
 * Returns:
 *     Whether the course joined the list.
 */
async function addAsPlayed(tx: Transaction, userId: string, courseId: string): Promise<boolean> {
  const inserted = await tx
    .insert(userCourses)
    .values({ userId, courseId, personalRank: null })
    .onConflictDoNothing({ target: [userCourses.userId, userCourses.courseId] })
    .returning({ id: userCourses.id });
  if (!inserted.length) return false;
  await tx.delete(wantToPlay).where(and(eq(wantToPlay.userId, userId), eq(wantToPlay.courseId, courseId)));
  return true;
}

/**
 * One-tap Played for a catalog course (#52): it joins the member's list
 * without a rank and without a round. Nothing ranks it later on its own.
 * Repeating it, or marking a course already on the list, changes nothing.
 *
 * Raises:
 *     AppError: 404 `course_not_found` for an unknown course.
 */
export async function markPlayed(db: Database, userId: string, courseId: string): Promise<{ added: boolean } & PersonalList> {
  return withJournalLock(db, userId, async (tx) => {
    await requireCourse(tx, courseId);
    return { added: await addAsPlayed(tx, userId, courseId), ...(await wholeList(tx, userId)) };
  });
}

/**
 * Played for a course described by its details (an outside search hit, or a
 * course typed in by hand): resolve or create the catalog row exactly as
 * `addCourseByDetails` does, then add it as Played, with no rank and no
 * round. A course already on the list is left alone.
 *
 * Returns:
 *     The course id, whether it joined the list, and the whole list.
 */
export async function addPlayedCourse(
  db: Database,
  userId: string,
  input: Exclude<CourseInput, { courseId: string }>,
): Promise<{ courseId: string; added: boolean } & PersonalList> {
  const result = await withJournalLock(db, userId, async (tx) => {
    const course = await findOrCreateCourse(tx, input, userId);
    const added = await addAsPlayed(tx, userId, course.id);
    return { courseId: course.id, added, created: course.created, list: await wholeList(tx, userId) };
  });
  if (result.created) invalidateCatalog();
  return { courseId: result.courseId, added: result.added, ...result.list };
}

/**
 * Take a course out of the ranking (#52). It stays on the list as Played,
 * with its rounds and Want to play; the ranks below close up and its
 * `ranked_at` is cleared. A Played course is left alone, so a retry changes
 * nothing.
 *
 * Raises:
 *     AppError: 404 `not_on_list` when the course is not on the list.
 */
export async function unrankCourse(db: Database, userId: string, courseId: string): Promise<PersonalList> {
  return withJournalLock(db, userId, async (tx) => {
    const current = await listing(tx, userId, courseId);
    if (!current) throw new AppError(404, ErrorCode.NotOnList, "That course is not on your list.");
    if (current.rank !== null) {
      // updated_at is when it became Played, which orders the Played line (db/schema.ts).
      await tx
        .update(userCourses)
        .set({ personalRank: null, rankedAt: null, updatedAt: sql`now()` })
        .where(and(eq(userCourses.userId, userId), eq(userCourses.courseId, courseId)));
      await renumber(tx, userId, await rankingIds(tx, userId));
    }
    return wholeList(tx, userId);
  });
}

/**
 * Log rounds from the Log Round dialog: resolve or create the course, put it
 * in the ranking at the bottom unless it is already Ranked (`putInRanking`),
 * and insert `quantity` rounds sharing one played date. A Ranked course
 * keeps its rank.
 */
export async function logRounds(
  db: Database,
  userId: string,
  input: CourseInput,
  quantity: number,
  playedAt?: string,
): Promise<{ courseId: string; count: number; roundIds: string[] } & PersonalList> {
  const count = Math.max(1, quantity);
  if (!("courseId" in input)) {
    const { courseId, roundIds, courses, unranked } = await addCourseByDetails(db, userId, input, { rank: null, quantity: count, playedOn: playedAt });
    return { courseId, count, roundIds, courses, unranked };
  }
  return withJournalLock(db, userId, async (tx) => {
    const courseId = await requireCourse(tx, input.courseId);
    await putInRanking(tx, userId, courseId, null);
    const roundIds = await insertRounds(tx, userId, courseId, count, playedAt);
    return { courseId, count: roundIds.length, roundIds, ...(await wholeList(tx, userId)) };
  });
}

/**
 * Add a course described by its details: resolve or create the catalog row,
 * put it in the ranking at `rank` unless it is already Ranked (clamped to
 * [1, N+1], bottom when null; a Ranked course keeps its rank, a Played one
 * is ranked), and log `quantity` rounds on `playedOn`.
 *
 * This is both "log a searched course" (`isCustom` false, bottom) and "add a
 * hand-entered course" (`isCustom` true, requested rank).
 *
 * Args:
 *     db: Database handle.
 *     userId: The acting member.
 *     input: Course details; `isCustom` marks hand-entered courses.
 *     options: `rank` for a course not yet Ranked, `quantity` (at least 1)
 *         and an optional ISO `playedOn` date (database date when absent).
 *
 * Returns:
 *     The course id, its rank, the ids of the rounds logged (for undo) and
 *     the whole updated list.
 */
export async function addCourseByDetails(
  db: Database,
  userId: string,
  input: Exclude<CourseInput, { courseId: string }>,
  options: { rank: number | null; quantity: number; playedOn?: string | undefined },
): Promise<{ courseId: string; rank: number; roundIds: string[] } & PersonalList> {
  const result = await withJournalLock(db, userId, async (tx) => {
    const course = await findOrCreateCourse(tx, input, userId);
    const { rank } = await putInRanking(tx, userId, course.id, options.rank);
    const roundIds = await insertRounds(tx, userId, course.id, Math.max(1, options.quantity), options.playedOn);
    return { courseId: course.id, rank, roundIds, created: course.created, list: await wholeList(tx, userId) };
  });
  if (result.created) invalidateCatalog();
  return { courseId: result.courseId, rank: result.rank, roundIds: result.roundIds, ...result.list };
}

/**
 * "Add to my list" for a catalog course, from any client: put it in the
 * ranking at the bottom unless it is already Ranked, and log one round when
 * the course has none. Adding twice is harmless.
 *
 * Returns:
 *     Whether the course was added to the list, and the updated list.
 */
export async function addToList(
  db: Database,
  userId: string,
  courseId: string,
  playedOn?: string,
): Promise<{ added: boolean } & PersonalList> {
  return withJournalLock(db, userId, async (tx) => {
    await requireCourse(tx, courseId);
    const { created } = await putInRanking(tx, userId, courseId, null);
    if ((await roundCount(tx, userId, courseId)) === 0) await insertRounds(tx, userId, courseId, 1, playedOn);
    return { added: created, ...(await wholeList(tx, userId)) };
  });
}

/**
 * Put a course at a rank: a Ranked course moves there, a Played course is
 * placed into the ranking there (`placeInRanking`). The whole ranking is
 * renumbered from its full order, so courses a view hides keep their places.
 *
 * Raises:
 *     AppError: 404 `not_on_list` when the course is not on the list.
 */
export async function moveCourse(
  db: Database,
  userId: string,
  courseId: string,
  rank: number,
): Promise<{ rank: number } & PersonalList> {
  return withJournalLock(db, userId, async (tx) => {
    if (!(await listing(tx, userId, courseId))) throw new AppError(404, ErrorCode.NotOnList, "That course is not on your list.");
    const placed = await rankCourse(tx, userId, courseId, await rankingIds(tx, userId), rank);
    return { rank: placed, ...(await wholeList(tx, userId)) };
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
): Promise<{ count: number; removed: boolean } & PersonalList> {
  return withJournalLock(db, userId, async (tx) => {
    if (!(await listing(tx, userId, courseId))) throw new AppError(404, ErrorCode.NotOnList, "That course is not on your list.");
    const target = Math.max(0, Math.floor(requested));
    if (target === 0) {
      await removeMembership(tx, userId, courseId);
      return { count: 0, removed: true, ...(await wholeList(tx, userId)) };
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
    return { count: target, removed: false, ...(await wholeList(tx, userId)) };
  });
}

/** Delete one round; deleting the last round for a course removes the course. */
export async function deleteRound(
  db: Database,
  userId: string,
  roundId: string,
): Promise<{ removedCourse: boolean; courseId: string } & PersonalList> {
  return withJournalLock(db, userId, async (tx) => {
    const [round] = await tx
      .select({ courseId: rounds.courseId })
      .from(rounds)
      .where(and(eq(rounds.userId, userId), eq(rounds.id, roundId)));
    if (!round) throw new AppError(404, ErrorCode.RoundNotFound, "That round no longer exists.");
    await tx.delete(rounds).where(and(eq(rounds.userId, userId), eq(rounds.id, roundId)));
    const remaining = await roundCount(tx, userId, round.courseId);
    if (remaining === 0) await removeMembership(tx, userId, round.courseId);
    return { removedCourse: remaining === 0, courseId: round.courseId, ...(await wholeList(tx, userId)) };
  });
}

/** Remove a course from the list, Ranked or Played, along with all its rounds. */
export async function deleteCourse(db: Database, userId: string, courseId: string): Promise<PersonalList> {
  return withJournalLock(db, userId, async (tx) => {
    if (!(await listing(tx, userId, courseId))) throw new AppError(404, ErrorCode.NotOnList, "That course is not on your list.");
    await removeMembership(tx, userId, courseId);
    return wholeList(tx, userId);
  });
}
