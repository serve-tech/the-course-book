import { and, asc, eq, isNull, ne } from "drizzle-orm";
import type { Database } from "../db/client";
import { courses, userCourses, users } from "../db/schema";
import { courseView } from "../domain/course-view";
import { equivalentCourses } from "../domain/identity";
import type { MemberList, PublicMember } from "@coursebook/domain/friends/types";
import { toPublicMember } from "./authz";
import { personalList } from "./journal";

/**
 * Member directory and read-only views of other members' lists. Only the
 * public projection of a member (username, display name) ever leaves here.
 */

/** Every other active member, ordered by username. */
export async function members(db: Database, viewerId: string): Promise<PublicMember[]> {
  const rows = await db
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(and(ne(users.id, viewerId), isNull(users.deletedAt)))
    .orderBy(asc(users.username));
  return rows.map(toPublicMember);
}

/**
 * A member's personal list for a viewer, or null when no such member exists.
 * `onMyList` uses the same identity rule as the catalog so a duplicate row
 * for the same course still reads as already listed.
 */
export async function memberList(
  db: Database,
  viewerId: string,
  username: string,
): Promise<MemberList | null> {
  const [member] = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(and(eq(users.username, username), isNull(users.deletedAt)));
  if (!member) return null;
  const [list, own] = await Promise.all([
    db
      .select({ course: courses, rank: userCourses.personalRank })
      .from(userCourses)
      .innerJoin(courses, eq(courses.id, userCourses.courseId))
      .where(eq(userCourses.userId, member.id))
      .orderBy(userCourses.personalRank),
    personalList(db, viewerId),
  ]);
  const ownCourses = own.map((entry) => entry.course);
  const ownIds = new Set(ownCourses.map((course) => course.id));
  return {
    member: toPublicMember(member),
    rows: list.map((row) => {
      const course = courseView(row.course);
      return {
        course,
        rank: row.rank,
        onMyList: ownIds.has(course.id) || ownCourses.some((mine) => equivalentCourses(mine, course)),
      };
    }),
  };
}
