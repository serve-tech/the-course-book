import type { Course } from "../catalog/course";

/**
 * Journal shapes shared by the server modules that produce them and the
 * components that render them.
 */

/** One Ranked course: a course on the member's list with a place in their ranking. */
export interface ListEntry {
  course: Course;
  rank: number;
  /** The member's rounds there. */
  played: number;
}

/** One Played course: on the member's list without a rank (#52). Played is a valid state, not a to-do. */
export interface UnrankedEntry {
  course: Course;
  /** The member's rounds there; often none. */
  played: number;
}

/** A member's whole list: the ranking in rank order, and the Played courses, most recently Played first. */
export interface PersonalList {
  courses: ListEntry[];
  unranked: UnrankedEntry[];
}

/** One logged round, newest first in histories. */
export interface RoundEntry {
  id: string;
  /** ISO date (YYYY-MM-DD). */
  playedAt: string;
}
