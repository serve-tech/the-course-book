import type { Course } from "../catalog/course";

/**
 * Journal shapes shared by the server modules that produce them and the
 * components that render them.
 */

/** One course on a member's personal list. */
export interface ListEntry {
  course: Course;
  rank: number;
  played: number;
}

/** One logged round, newest first in histories. */
export interface RoundEntry {
  id: string;
  /** ISO date (YYYY-MM-DD). */
  playedAt: string;
}

/** Play counts and list membership for a member. */
export interface ListSummary {
  /** Round count per course id (only courses with at least one round). */
  played: Record<string, number>;
  /** Course ids on the member's list, in rank order. */
  onList: string[];
}
