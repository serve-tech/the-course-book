/**
 * How two members' personal rankings compare, for a friend's profile
 * ("You and Maya": courses in common, how often you agree, the biggest
 * split). Pure: the caller matches courses between the lists, because
 * course equivalence is an API-side identity rule.
 */

/** One course both members have ranked. */
export interface SharedCourse {
  courseId: string;
  /** The viewer's personal rank (1-based). */
  myRank: number;
  /** The other member's personal rank (1-based). */
  theirRank: number;
}

/** The course whose relative positions differ most between the two lists. */
export interface RankSplit {
  courseId: string;
  myRank: number;
  theirRank: number;
}

export interface RankComparison {
  inCommon: number;
  /**
   * Share of concordant pairs among shared courses, 0 to 1: for every two
   * shared courses, whether both members put them in the same order. Null
   * when fewer than `MIN_SHARED_FOR_AGREEMENT` courses are shared, where one
   * or two pairs would say more about chance than taste.
   */
  agreement: number | null;
  biggestSplit: RankSplit | null;
}

/** Fewest shared courses that give a meaningful agreement figure (3 pairs). */
export const MIN_SHARED_FOR_AGREEMENT = 3;

/**
 * Compare two rankings over the courses they share.
 *
 * Args:
 *     shared: The shared courses with each member's rank; order does not
 *         matter. A course must appear once.
 *     myTotal: Length of the viewer's list, for percentile positions.
 *     theirTotal: Length of the other member's list.
 *
 * Returns:
 *     Courses in common, the agreement (share of concordant pairs; null
 *     below three shared courses) and the biggest split. The split compares
 *     percentile positions (rank / list length), because #9 of 9 and #9 of
 *     150 mean very different things. Ties go to the course ranked higher
 *     by both combined, then to the smaller course id, so the result is
 *     deterministic.
 *
 * Example:
 *     >>> compareRankings([{courseId: "a", myRank: 1, theirRank: 2}], 10, 10).inCommon
 *     1
 */
export function compareRankings(shared: readonly SharedCourse[], myTotal: number, theirTotal: number): RankComparison {
  return {
    inCommon: shared.length,
    agreement: shared.length >= MIN_SHARED_FOR_AGREEMENT ? concordance(shared) : null,
    biggestSplit: biggestSplit(shared, myTotal, theirTotal),
  };
}

function concordance(shared: readonly SharedCourse[]): number {
  let agree = 0;
  let pairs = 0;
  for (let i = 0; i < shared.length; i++) {
    for (let j = i + 1; j < shared.length; j++) {
      const a = shared[i];
      const b = shared[j];
      if (!a || !b) continue;
      pairs++;
      if (Math.sign(a.myRank - b.myRank) === Math.sign(a.theirRank - b.theirRank)) agree++;
    }
  }
  return pairs ? agree / pairs : 0;
}

function biggestSplit(shared: readonly SharedCourse[], myTotal: number, theirTotal: number): RankSplit | null {
  let best: { course: SharedCourse; gap: number } | null = null;
  for (const course of shared) {
    // |myRank/myTotal - theirRank/theirTotal| over the common denominator
    // myTotal * theirTotal: comparing integer numerators keeps ties exact,
    // where floating-point division would make 0.3 - 0.1 differ from 0.2.
    const gap = Math.abs(course.myRank * Math.max(theirTotal, 1) - course.theirRank * Math.max(myTotal, 1));
    if (!best || gap > best.gap || (gap === best.gap && prefer(course, best.course))) best = { course, gap };
  }
  if (!best || best.gap === 0) return null;
  const { courseId, myRank, theirRank } = best.course;
  return { courseId, myRank, theirRank };
}

/** Tie-break: higher combined position first, then the smaller id. */
function prefer(a: SharedCourse, b: SharedCourse): boolean {
  const combined = a.myRank + a.theirRank - (b.myRank + b.theirRank);
  return combined !== 0 ? combined < 0 : a.courseId < b.courseId;
}
