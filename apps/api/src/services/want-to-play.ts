import { and, desc, eq } from "drizzle-orm";
import type { WantToPlayEntry } from "@coursebook/domain/social/types";
import type { Database, Executor } from "../db/client";
import { wantToPlay } from "../db/schema";
import { requireCourse } from "./catalog";
import { visibleMember } from "./friends";
import { withJournalLock } from "./journal";
import { courseViews } from "./timeline";

/**
 * Want to play: each member's wishlist of courses (decision 2026-09-29,
 * social redesign). Members see their own and their accepted friends'
 * lists. Adding and removing are idempotent and run under the member's
 * journal lock; logging a round at a course takes it off (`insertRounds`).
 */

/** A member's Want to play list, newest first. */
export async function wantToPlayList(db: Executor, userId: string): Promise<WantToPlayEntry[]> {
  const rows = await db
    .select({ courseId: wantToPlay.courseId, addedAt: wantToPlay.createdAt })
    .from(wantToPlay)
    .where(eq(wantToPlay.userId, userId))
    .orderBy(desc(wantToPlay.createdAt), wantToPlay.courseId);
  const views = await courseViews(db, rows.map((row) => row.courseId));
  return rows.flatMap((row) => {
    const course = views.get(row.courseId);
    return course ? [{ course, addedAt: row.addedAt.toISOString() }] : [];
  });
}

/**
 * The viewer's own or an accepted friend's Want to play list.
 *
 * Returns:
 *     The list, or null when the member is unknown or not the viewer's
 *     friend (indistinguishable on purpose).
 */
export async function memberWantToPlay(db: Database, viewerId: string, username: string): Promise<WantToPlayEntry[] | null> {
  const member = await visibleMember(db, viewerId, username);
  return member ? wantToPlayList(db, member.id) : null;
}

/**
 * Put a catalog course on the member's Want to play list. Adding it again
 * keeps the original date. Played courses are allowed ("play it again").
 *
 * Raises:
 *     AppError: 404 `course_not_found` for an unknown course.
 */
export async function addWantToPlay(db: Database, userId: string, courseId: string): Promise<WantToPlayEntry[]> {
  return withJournalLock(db, userId, async (tx) => {
    await requireCourse(tx, courseId);
    await tx.insert(wantToPlay).values({ userId, courseId }).onConflictDoNothing();
    return wantToPlayList(tx, userId);
  });
}

/** Take a course off the member's Want to play list; removing one that is not there changes nothing. */
export async function removeWantToPlay(db: Database, userId: string, courseId: string): Promise<WantToPlayEntry[]> {
  return withJournalLock(db, userId, async (tx) => {
    await tx.delete(wantToPlay).where(and(eq(wantToPlay.userId, userId), eq(wantToPlay.courseId, courseId)));
    return wantToPlayList(tx, userId);
  });
}
