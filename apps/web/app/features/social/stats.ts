import type { Course } from "@coursebook/domain/catalog/course";
import { stateName } from "@coursebook/domain/catalog/geography";

/**
 * Numbers a profile can show from a member's ranking alone: where they have
 * played and how far through the national Top 100s they are. Every course on
 * a ranking has been played, so a course on it counts as played.
 */

/** The parts of a ranking row these stats read. */
export interface RankedPlay {
  course: Course;
  played: number;
}

export interface NationalProgress {
  title: string;
  played: number;
  size: number;
}

/** National Top 100 sizes; state lists vary and come from the Lists tab. */
const NATIONAL_SIZE = 100;

/** Progress through the USA, World and USA Public Top 100s, from the courses' published ranks. */
export function nationalProgress(rows: readonly RankedPlay[]): NationalProgress[] {
  const count = (rank: (course: Course) => number | null) => rows.filter((row) => rank(row.course) !== null).length;
  return [
    { title: "USA Top 100", played: count((course) => course.usa), size: NATIONAL_SIZE },
    { title: "World Top 100", played: count((course) => course.world), size: NATIONAL_SIZE },
    { title: "USA Public Top 100", played: count((course) => course.public), size: NATIONAL_SIZE },
  ];
}

export interface PlaceStats {
  /** Distinct U.S. states with at least one course. */
  states: number;
  /** Distinct countries, the USA included. */
  countries: number;
  /** The U.S. state with the most courses, e.g. "Michigan"; null without U.S. courses. */
  topState: string | null;
  /** The course with the most rounds; null for an empty ranking. Ties go to the higher rank. */
  mostPlayed: RankedPlay | null;
}

/** Where a member has played, from their ranking (in rank order). */
export function placeStats(rows: readonly RankedPlay[]): PlaceStats {
  const states = new Map<string, number>();
  const countries = new Set<string>();
  let mostPlayed: RankedPlay | null = null;
  for (const row of rows) {
    const country = row.course.country.trim().toUpperCase();
    if (country) countries.add(country === "UK" ? "UNITED KINGDOM" : country);
    const state = row.course.state.trim().toUpperCase();
    if (country === "USA" && state) states.set(state, (states.get(state) ?? 0) + 1);
    if (!mostPlayed || row.played > mostPlayed.played) mostPlayed = row;
  }
  let topState: string | null = null;
  let topCount = 0;
  for (const [state, count] of states)
    if (count > topCount) {
      topState = state;
      topCount = count;
    }
  return { states: states.size, countries: countries.size, topState: topState ? stateName(topState) : null, mostPlayed };
}
