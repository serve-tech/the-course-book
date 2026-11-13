import type { Course } from "@coursebook/domain/catalog/course";
import type { PublicMember } from "@coursebook/domain/friends/types";
import type { CourseFriendRank, CoursePage } from "@coursebook/domain/social/types";

/**
 * Pure rules for a course's page (decision 2026-11-13): the viewer's rank
 * and Want to play for the course, and their friends' ranks and Want to
 * play. The service reads the rows for the viewer and their friends only;
 * this assembles and orders them.
 */

/** A member and their id, which never leaves the API. */
export interface IdentifiedMember {
  id: string;
  member: PublicMember;
}

/** The rows read for one course, for the viewer and their friends. */
export interface CoursePageRows {
  course: Course;
  viewerId: string;
  /** The viewer's accepted, active friends. */
  friends: readonly IdentifiedMember[];
  /** Who has the course on their ranking, and at what rank. */
  ranks: readonly { userId: string; rank: number }[];
  /** How many courses each member's ranking holds. */
  sizes: readonly { userId: string; size: number }[];
  /** Who wants to play the course. */
  wanted: readonly { userId: string }[];
}

const byName = (a: PublicMember, b: PublicMember) => a.displayName.localeCompare(b.displayName) || a.username.localeCompare(b.username);

/**
 * Assemble a course page from the rows read for it.
 *
 * Rows for members other than the viewer and their friends are ignored, so
 * the page can never show a stranger.
 *
 * Returns:
 *     The page: the viewer's rank (null when the course is not on their
 *     ranking), ranking size and Want to play; friends with it on their
 *     ranking, best rank first and then by name; friends who want to play
 *     it, by name.
 */
export function coursePageFrom(rows: CoursePageRows): CoursePage {
  const rankOf = new Map(rows.ranks.map((row) => [row.userId, row.rank]));
  const sizeOf = new Map(rows.sizes.map((row) => [row.userId, row.size]));
  const wants = new Set(rows.wanted.map((row) => row.userId));
  const friendsRanked: CourseFriendRank[] = rows.friends
    .flatMap(({ id, member }) => {
      const rank = rankOf.get(id);
      return rank === undefined ? [] : [{ member, rank, outOf: sizeOf.get(id) ?? rank }];
    })
    .sort((a, b) => a.rank - b.rank || byName(a.member, b.member));
  return {
    course: rows.course,
    you: {
      rank: rankOf.get(rows.viewerId) ?? null,
      outOf: sizeOf.get(rows.viewerId) ?? 0,
      wantToPlay: wants.has(rows.viewerId),
    },
    friendsRanked,
    friendsWantToPlay: rows.friends.filter(({ id }) => wants.has(id)).map(({ member }) => member).sort(byName),
  };
}
