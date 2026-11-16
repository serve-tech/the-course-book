/**
 * Pure rules for splitting a member's list into its two states (#52): the
 * ranking (Ranked courses, rank order) and the Played courses (on the list
 * without a rank). Services read every membership in one query and split it
 * here, so the ranking and the Played line always come from the same read.
 */

/** The parts of a membership row the split reads. */
export interface MembershipRow {
  course: { id: string; name: string };
  /** 1..N for a Ranked course; null for a Played one. */
  rank: number | null;
  /** When the row last changed; for a Played row, when it became Played (see `userCourses` in db/schema.ts). */
  updatedAt: Date;
}

/** The two states of a list: the ranking and the Played courses. */
export interface SplitList<T extends MembershipRow> {
  ranked: (T & { rank: number })[];
  unranked: T[];
}

const isRanked = <T extends MembershipRow>(row: T): row is T & { rank: number } => row.rank !== null;

/**
 * Split memberships into the ranking and the Played courses.
 *
 * Returns:
 *     `ranked` in rank order (ties, which the unique constraint rules out,
 *     by course id); `unranked` most recently Played first, then by name and
 *     id so equal times still give a stable order.
 *
 * Example:
 *     >>> splitList([{ course: { id: "a", name: "A" }, rank: null, updatedAt: new Date() }]).unranked.length
 *     1
 */
export function splitList<T extends MembershipRow>(rows: readonly T[]): SplitList<T> {
  const ranked = rows.filter(isRanked).sort((a, b) => a.rank - b.rank || a.course.id.localeCompare(b.course.id));
  const unranked = rows
    .filter((row) => row.rank === null)
    .sort(
      (a, b) =>
        b.updatedAt.getTime() - a.updatedAt.getTime() ||
        a.course.name.localeCompare(b.course.name) ||
        a.course.id.localeCompare(b.course.id),
    );
  return { ranked, unranked };
}

/**
 * The number to send in a contract field that must hold a rank, such as
 * `TimelineRound.rank`, for a course that may be Played.
 *
 * Such fields predate Played courses and cannot become nullable (the
 * contract only grows), so a Played course is reported one below the
 * ranking: its size plus one. Each such field has an honest nullable twin
 * (`personalRank`), which clients should read.
 *
 * Args:
 *     rank: The course's rank; null when it is Played.
 *     rankingSize: How many courses the member's ranking holds.
 */
export function rankOrBelow(rank: number | null, rankingSize: number): number {
  return rank ?? rankingSize + 1;
}
