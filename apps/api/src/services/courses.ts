import { and, count, eq, inArray } from "drizzle-orm";
import type { CoursePage } from "@coursebook/domain/social/types";
import type { Executor } from "../db/client";
import { userCourses, wantToPlay } from "../db/schema";
import { coursePageFrom } from "../domain/course-page";
import { friendMembers } from "./friends";
import { courseViews } from "./timeline";

/**
 * One course for the viewer: its page (decision 2026-11-13). Reads the
 * course and, for the viewer and their friends only, rankings and Want to
 * play; `domain/course-page.ts` assembles them.
 *
 * Args:
 *     db: Database or transaction.
 *     viewerId: The signed-in member.
 *     courseId: The catalog course.
 *
 * Returns:
 *     The page, or null when no course has that id.
 */
export async function coursePage(db: Executor, viewerId: string, courseId: string): Promise<CoursePage | null> {
  const [views, friends] = await Promise.all([courseViews(db, [courseId]), friendMembers(db, viewerId)]);
  const course = views.get(courseId);
  if (!course) return null;
  const memberIds = [viewerId, ...friends.map((friend) => friend.id)];
  const [ranks, sizes, wanted] = await Promise.all([
    db
      .select({ userId: userCourses.userId, rank: userCourses.personalRank })
      .from(userCourses)
      .where(and(eq(userCourses.courseId, courseId), inArray(userCourses.userId, memberIds))),
    db
      .select({ userId: userCourses.userId, size: count() })
      .from(userCourses)
      .where(inArray(userCourses.userId, memberIds))
      .groupBy(userCourses.userId),
    db
      .select({ userId: wantToPlay.userId })
      .from(wantToPlay)
      .where(and(eq(wantToPlay.courseId, courseId), inArray(wantToPlay.userId, memberIds))),
  ]);
  return coursePageFrom({ course, viewerId, friends, ranks, sizes, wanted });
}
