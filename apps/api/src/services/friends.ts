import { and, asc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { courses, userCourses, users } from "../db/schema";
import { courseView } from "../domain/course-view";
import { equivalentCourses } from "../domain/identity";
import type { MemberList, PublicMember } from "@coursebook/domain/friends/types";
import { toPublicMember } from "./authz";
import { rankedViews } from "./catalog";
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

export interface MemberPage {
  members: PublicMember[];
  /** Username to pass as `after` for the next page; null on the last page. */
  nextCursor: string | null;
}

/**
 * One page of the member directory, ordered by lowercased username.
 *
 * Args:
 *     db: Database handle.
 *     viewerId: The signed-in member, who is never listed.
 *     page: `after` is the previous page's cursor (null for the first page);
 *         `limit` is the page size.
 *
 * Returns:
 *     The members and the cursor for the next page. Keyset pagination on
 *     `lower(username)` matches the case-insensitive unique index, so pages
 *     stay stable while members join.
 */
export async function memberPage(
  db: Database,
  viewerId: string,
  page: { after: string | null; limit: number },
): Promise<MemberPage> {
  const key = sql<string>`lower(${users.username})`;
  const rows = await db
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(
      and(
        ne(users.id, viewerId),
        isNull(users.deletedAt),
        page.after === null ? undefined : gt(key, page.after.toLowerCase()),
      ),
    )
    .orderBy(asc(key))
    .limit(page.limit + 1);
  const members = rows.slice(0, page.limit).map(toPublicMember);
  return {
    members,
    nextCursor: rows.length > page.limit ? (members.at(-1)?.username ?? null) : null,
  };
}

/**
 * A member's personal list for a viewer, or null when no such member exists.
 * The username matches case-insensitively, like the unique index.
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
    .where(and(sql`lower(${users.username}) = lower(${username})`, isNull(users.deletedAt)));
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
  const views = await rankedViews(db, list.map((row) => row.course));
  const ownCourses = own.map((entry) => entry.course);
  const ownIds = new Set(ownCourses.map((course) => course.id));
  return {
    member: toPublicMember(member),
    rows: list.map((row) => {
      const course = views.get(row.course.id) ?? courseView(row.course);
      return {
        course,
        rank: row.rank,
        onMyList: ownIds.has(course.id) || ownCourses.some((mine) => equivalentCourses(mine, course)),
      };
    }),
  };
}
