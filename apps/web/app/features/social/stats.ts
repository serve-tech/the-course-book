import { RegionFilter, type Course } from "@coursebook/domain/catalog/course";
import { matchesRegion, stateOptions } from "@coursebook/domain/catalog/geography";
import type { ShareView } from "@coursebook/domain/sharing/view";
import { ListTab } from "../top-lists/lists";

/**
 * Numbers a profile can show from a member's ranking alone: where they have
 * played and how far through the national Top 100s they are. Every course on
 * a ranking has been played, so a course on it counts as played. Nothing here
 * needs a round, because rounds barely matter (decision 2026-11-03,
 * ranking-first product); only `mostPlayed` reads them.
 */

/** The parts of a ranking row these stats read. */
export interface RankedPlay {
  course: Course;
  played: number;
}

/** How far a member is through one national Top 100. */
export interface NationalProgress {
  /** The list, as the Lists tab names it in its URLs. */
  list: ListTab;
  title: string;
  played: number;
  size: number;
}

/** National Top 100 sizes; state lists vary and come from the Lists tab. */
const NATIONAL_SIZE = 100;

/** Progress through the World, USA, USA Public and International Top 100s, from the courses' published ranks. */
export function nationalProgress(rows: readonly { course: Course }[]): NationalProgress[] {
  const count = (rank: (course: Course) => number | null) => rows.filter((row) => rank(row.course) !== null).length;
  return [
    { list: ListTab.World, title: "World Top 100", played: count((course) => course.global), size: NATIONAL_SIZE },
    { list: ListTab.USA, title: "USA Top 100", played: count((course) => course.usa), size: NATIONAL_SIZE },
    { list: ListTab.Public, title: "USA Public Top 100", played: count((course) => course.public), size: NATIONAL_SIZE },
    { list: ListTab.International, title: "International Top 100", played: count((course) => course.world), size: NATIONAL_SIZE },
  ];
}

/** One place a member has played, with how many of their courses are there. */
export interface PlaceCount {
  /** A U.S. state's two-letter code, or a country's upper-cased name; unique within its list. */
  key: string;
  /** The place as people read it: "Michigan", "Scotland". */
  name: string;
  courses: number;
}

/** Every U.S. state and every country on a ranking, most courses first. */
export interface PlaceBreakdown {
  /** U.S. states only; a U.S. course without a state is left out. */
  states: PlaceCount[];
  /** Countries, the USA included. */
  countries: PlaceCount[];
}

/** A state's name for its code; the code itself when it names no state. */
function stateLabel(code: string): string {
  return stateOptions.find((state) => state.code === code)?.name ?? code;
}

/** Tally places in the order they first appear, then sort most first; ties keep that order. */
function tally(entries: readonly { key: string; name: string }[]): PlaceCount[] {
  const counts = new Map<string, PlaceCount>();
  for (const { key, name } of entries) {
    const seen = counts.get(key);
    if (seen) seen.courses += 1;
    else counts.set(key, { key, name, courses: 1 });
  }
  return [...counts.values()].sort((a, b) => b.courses - a.courses);
}

/**
 * Where a member has played: each U.S. state and each country, with its
 * course count.
 *
 * Args:
 *     rows: The member's courses, in rank order.
 *
 * Returns:
 *     States and countries, most courses first. A tie keeps rank order: the
 *     place with the higher-ranked course comes first, so the first state is
 *     also the one "Most courses in" names. Countries match case-insensitively,
 *     and "UK" reads as "United Kingdom".
 *
 * Example:
 *     >>> placeBreakdown(rows).states
 *     [{ key: "MI", name: "Michigan", courses: 12 }, { key: "OH", name: "Ohio", courses: 2 }]
 */
export function placeBreakdown(rows: readonly { course: Course }[]): PlaceBreakdown {
  const states: { key: string; name: string }[] = [];
  const countries: { key: string; name: string }[] = [];
  for (const { course } of rows) {
    const written = course.country.trim();
    const country = written.toUpperCase();
    if (!country) continue;
    countries.push(country === "UK" ? { key: "UNITED KINGDOM", name: "United Kingdom" } : { key: country, name: written });
    const state = course.state.trim().toUpperCase();
    if (country === "USA" && state) states.push({ key: state, name: stateLabel(state) });
  }
  return { states: tally(states), countries: tally(countries) };
}

/** Where a member has played, as numbers. */
export interface PlaceCounts {
  /** Distinct U.S. states with at least one course. */
  states: number;
  /** Distinct countries, the USA included. */
  countries: number;
  /** The U.S. state with the most courses, e.g. "Michigan"; null without U.S. courses. */
  topState: string | null;
  /** That state's two-letter code; null without U.S. courses. */
  topStateCode: string | null;
}

/** Where a member has played, from any list of their courses: the counts of `placeBreakdown`. */
export function placeCounts(rows: readonly { course: Course }[]): PlaceCounts {
  const { states, countries } = placeBreakdown(rows);
  const top = states[0] ?? null;
  return { states: states.length, countries: countries.length, topState: top?.name ?? null, topStateCode: top?.key ?? null };
}

/**
 * The view of a member's ranking that shows a state's courses, for linking a
 * state to them.
 *
 * Args:
 *     rows: The member's courses.
 *     code: A state's two-letter code, as `placeBreakdown` keys it.
 *
 * Returns:
 *     The whole "Best in <state>" view; null when it would hold none of the
 *     member's courses (an unknown code, or a course whose address disagrees
 *     with its state), so a link never opens on an empty list.
 */
export function stateView(rows: readonly { course: Course }[], code: string): ShareView | null {
  const view: ShareView = { region: RegionFilter.State, state: code, top: null };
  return rows.some(({ course }) => matchesRegion(course, view.region, view.state)) ? view : null;
}

/**
 * The course a member has played most, worth a mention only when they have
 * been back: null for an empty ranking and when no course has two rounds.
 * Ties go to the higher rank.
 *
 * Args:
 *     rows: The member's courses, in rank order.
 */
export function mostPlayed<T extends RankedPlay>(rows: readonly T[]): T | null {
  let most: T | null = null;
  for (const row of rows) if (row.played > 1 && (!most || row.played > most.played)) most = row;
  return most;
}
