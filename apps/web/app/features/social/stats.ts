import type { Course } from "@coursebook/domain/catalog/course";
import { stateOptions } from "@coursebook/domain/catalog/geography";
import { compareTopLists, isNationalList, isStateList, topListTitle, type TopListEntry } from "@coursebook/domain/social/top-lists";
import { topListSlug } from "../top-lists/lists";

/**
 * Numbers a profile shows from a member's ranking: where they have played
 * and how far through the published lists they are. Every course on a
 * ranking has been played, so a course on it counts as played. Nothing here
 * needs a round, because rounds barely matter (decision 2026-11-03,
 * ranking-first product).
 */

/** How far a member is through one national Top 100. */
export interface NationalProgress {
  title: string;
  played: number;
  size: number;
}

/** National Top 100 sizes, for progress counted without the published entries. */
const NATIONAL_SIZE = 100;

/**
 * Progress through the World, USA, USA Public and International Top 100s,
 * from the courses' published ranks alone. The Stats tab counts from the
 * published entries instead (`profileStats`), which also gives state lists.
 */
export function nationalProgress(rows: readonly { course: Course }[]): NationalProgress[] {
  const count = (rank: (course: Course) => number | null) => rows.filter((row) => rank(row.course) !== null).length;
  return [
    { title: "World Top 100", played: count((course) => course.global), size: NATIONAL_SIZE },
    { title: "USA Top 100", played: count((course) => course.usa), size: NATIONAL_SIZE },
    { title: "USA Public Top 100", played: count((course) => course.public), size: NATIONAL_SIZE },
    { title: "International Top 100", played: count((course) => course.world), size: NATIONAL_SIZE },
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

/** A place as `PlaceCount` keys and names it. */
interface Place {
  key: string;
  name: string;
}

/**
 * The country and U.S. state a course counts toward: no country without one
 * written, no state outside the USA or without one written. Countries match
 * case-insensitively, and "UK" reads as "United Kingdom".
 */
function placesOf(course: Course): { country: Place | null; state: Place | null } {
  const written = course.country.trim();
  const country = written.toUpperCase();
  if (!country) return { country: null, state: null };
  const state = course.state.trim().toUpperCase();
  return {
    country: country === "UK" ? { key: "UNITED KINGDOM", name: "United Kingdom" } : { key: country, name: written },
    state: country === "USA" && state ? { key: state, name: stateLabel(state) } : null,
  };
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
 *     also the one "Most courses in" names.
 *
 * Example:
 *     >>> placeBreakdown(rows).states
 *     [{ key: "MI", name: "Michigan", courses: 12 }, { key: "OH", name: "Ohio", courses: 2 }]
 */
export function placeBreakdown(rows: readonly { course: Course }[]): PlaceBreakdown {
  const states: Place[] = [];
  const countries: Place[] = [];
  for (const { course } of rows) {
    const { country, state } = placesOf(course);
    if (country) countries.push(country);
    if (state) states.push(state);
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

/** One published ranking entry with its rank on the list, as `GET /v1/rankings` returns it. */
export interface PublishedEntry extends TopListEntry {
  rank: number;
}

/** A course on the member's ranking, as the Stats tab names it. */
export interface RankedRef {
  id: string;
  name: string;
  /** The member's rank for it. */
  rank: number;
}

/** A member's progress through one published list, and where the list opens. */
export interface ListProgress {
  /** The list in profile URLs: "usa", "state-mi". */
  slug: string;
  /** "World Top 100", "Best in Michigan". */
  title: string;
  played: number;
  size: number;
  /** The member's top-ranked course on the list; null when they have played none of it. */
  top: RankedRef | null;
}

/** A place a member has played in, with their top-ranked course there. */
export interface PlaceStat extends PlaceCount {
  top: RankedRef;
}

/** A U.S. state a member has played in, with their progress through its published list. */
export interface StateProgress extends PlaceStat {
  /** The state's "Best in" list; null when none is published for the state. */
  list: ListProgress | null;
}

/** The best course a member has played on a list, going by the list's own ranks. */
export interface BestPlayed {
  slug: string;
  title: string;
  course: RankedRef;
  /** The course's rank on the list. */
  published: number;
}

/** The course a member's ranking and a published list disagree on most. */
export interface Disagreement {
  course: RankedRef;
  /** The list's title and slug. */
  title: string;
  slug: string;
  /** How many of the member's courses are on the list. */
  of: number;
  /** Where the list puts the course among those, 1 being its best. */
  listPosition: number;
  /** Where the member puts it among the same courses. */
  ownPosition: number;
}

/** Why a course is a member's hidden gem. */
export enum GemReason {
  /** It is on no published list. */
  Unlisted = "unlisted",
  /** It is on its state's list and no national one. */
  StateListOnly = "state-list-only",
  /** A list has it, lower than the member does. */
  RankedHigher = "ranked-higher",
}

/** The course a member rates well above what the published lists say. */
export interface HiddenGem {
  reason: GemReason;
  course: RankedRef;
  /** For `StateListOnly`: the state's list and the course's rank on it. */
  stateList: { slug: string; title: string; published: number } | null;
  /** For `RankedHigher`: how the list and the member place it. */
  gap: Disagreement | null;
}

/** How many places a section shows before its "Show all" button. */
export const PLACES_SHOWN = 6;

/** A list only this far past `PLACES_SHOWN` is shown whole: a button that reveals a row or two isn't worth a tap. */
const SHOWN_SLACK = 2;

/**
 * The places a section shows. A member can have played in every state, so a
 * long list starts as its first few (they come most courses first).
 *
 * Args:
 *     places: Every place.
 *     expanded: Whether the member asked for all of them.
 *
 * Returns:
 *     All of them when expanded or when the list is at most two past
 *     `PLACES_SHOWN`; otherwise the first `PLACES_SHOWN`.
 */
export function shownPlaces<T>(places: readonly T[], expanded: boolean): readonly T[] {
  return expanded || places.length <= PLACES_SHOWN + SHOWN_SLACK ? places : places.slice(0, PLACES_SHOWN);
}

/** Everything the Stats tab shows. */
export interface ProfileStats {
  /** Courses on the ranking. */
  courses: number;
  /** The national Top 100s, in display order, whether or not any is played. */
  national: ListProgress[];
  /** Each state played, most courses first, with its list. */
  states: StateProgress[];
  /** Each country played, the USA included, most courses first. */
  countries: PlaceStat[];
  /** The best course played on each national list; a list with none played is left out. */
  best: BestPlayed[];
  /** A course the member rates above what the lists say; null only for a ranking with nothing to pick from. */
  hiddenGem: HiddenGem | null;
  /** Never the hidden gem's course. Null when no list holds three of the member's courses, or when they agree with every list. */
  disagreement: Disagreement | null;
}

/** A member's course on a published list, with its rank there. */
interface Listed {
  course: RankedRef;
  published: number;
}

/** A published list with the member's courses on it, in the member's rank order. */
interface PlayedList {
  type: string;
  scope: string;
  title: string;
  size: number;
  listed: Listed[];
}

/** Fewest of a member's courses a list must hold before its order is compared with theirs. */
const MIN_TO_COMPARE = 3;

/** Every published list, in display order, joined to the member's courses on it. */
function playedLists(refs: readonly RankedRef[], entries: readonly PublishedEntry[]): PlayedList[] {
  const byId = new Map(refs.map((course) => [course.id, course]));
  const lists = new Map<string, PlayedList>();
  for (const entry of entries) {
    const key = entry.type + ":" + entry.scope;
    const list = lists.get(key) ?? { type: entry.type, scope: entry.scope, title: topListTitle(entry.type, entry.scope), size: 0, listed: [] };
    list.size += 1;
    const course = byId.get(entry.courseId);
    if (course) list.listed.push({ course, published: entry.rank });
    lists.set(key, list);
  }
  for (const list of lists.values()) list.listed.sort((a, b) => a.course.rank - b.course.rank);
  return [...lists.values()].sort(compareTopLists);
}

function listProgress(list: PlayedList): ListProgress {
  return { slug: topListSlug(list), title: list.title, played: list.listed.length, size: list.size, top: list.listed[0]?.course ?? null };
}

/** The member's course a list ranks best. */
function bestPlayed(list: PlayedList): BestPlayed | null {
  let best: Listed | null = null;
  for (const item of list.listed) if (!best || item.published < best.published) best = item;
  return best && { slug: topListSlug(list), title: list.title, course: best.course, published: best.published };
}

/**
 * The widest gap between a published list's order and a member's: among the
 * member's courses on one list, the course whose place in the list's order
 * is furthest from its place in the member's.
 *
 * Args:
 *     lists: Every list with the member's courses on it, in display order.
 *     keep: Which gaps count. `higher` is how many places above the list's
 *         order the member has the course (negative when below).
 *
 * Returns:
 *     The widest gap that counts, over every list holding at least three of
 *     the member's courses. A tie goes to the course the member ranks
 *     higher, then to the earlier list. Null when none counts or every gap
 *     is zero.
 */
function widestGap(lists: readonly PlayedList[], keep: (higher: number, course: RankedRef) => boolean): Disagreement | null {
  let found: Disagreement | null = null;
  let widest = 0;
  for (const list of lists) {
    if (list.listed.length < MIN_TO_COMPARE) continue;
    const byList = [...list.listed].sort((a, b) => a.published - b.published);
    list.listed.forEach((item, index) => {
      const ownPosition = index + 1;
      const listPosition = byList.indexOf(item) + 1;
      const higher = listPosition - ownPosition;
      if (!keep(higher, item.course)) return;
      const gap = Math.abs(higher);
      if (gap > widest || (gap === widest && found !== null && item.course.rank < found.course.rank)) {
        widest = gap;
        found = { course: item.course, title: list.title, slug: topListSlug(list), of: list.listed.length, listPosition, ownPosition };
      }
    });
  }
  return widest > 0 ? found : null;
}

/**
 * A member's hidden gem: a course they rate above what the lists say.
 *
 * Args:
 *     refs: The member's courses, in rank order.
 *     lists: Every list with the member's courses on it, in display order.
 *
 * Returns:
 *     Their top-ranked course that is on no national list (on its state's
 *     list, or on none), when it sits in the top half of their ranking, so a
 *     course near the bottom is never called a gem. Otherwise the course a
 *     list puts furthest below where they do. Otherwise that top-ranked
 *     course off the national lists, wherever it sits. Null for a ranking
 *     with none of these: every course on a national list that ranks it no
 *     lower than the member does.
 */
function hiddenGem(refs: readonly RankedRef[], lists: readonly PlayedList[]): HiddenGem | null {
  const national = new Set(lists.filter((list) => isNationalList(list.type)).flatMap((list) => list.listed.map((item) => item.course.id)));
  const offNational = refs.find((course) => !national.has(course.id)) ?? null;
  const quiet = (course: RankedRef): HiddenGem => {
    for (const list of lists) {
      if (!isStateList(list.type)) continue;
      const item = list.listed.find((listed) => listed.course.id === course.id);
      if (item) return { reason: GemReason.StateListOnly, course, stateList: { slug: topListSlug(list), title: list.title, published: item.published }, gap: null };
    }
    return { reason: GemReason.Unlisted, course, stateList: null, gap: null };
  };
  if (offNational && offNational.rank <= Math.ceil(refs.length / 2)) return quiet(offNational);
  const gap = widestGap(lists, (higher) => higher > 0);
  if (gap) return { reason: GemReason.RankedHigher, course: gap.course, stateList: null, gap };
  return offNational && quiet(offNational);
}

/**
 * How many of the courses a member played in a state are on its list, as the
 * start of a sentence that ends with the list's name.
 *
 * Args:
 *     courses: Courses played in the state.
 *     onList: How many of those the state's list holds.
 *     whose: "your" or "their".
 *
 * Example:
 *     >>> listedPhrase(14, 13, "your")
 *     "13 of your 14 are on"
 *     >>> listedPhrase(4, 4, "your")
 *     "All 4 are on"
 */
export function listedPhrase(courses: number, onList: number, whose: string): string {
  if (courses === 1) return onList ? "It's on" : "It isn't on";
  if (onList === 0) return "None are on";
  if (onList === courses) return courses === 2 ? "Both are on" : "All " + String(courses) + " are on";
  return String(onList) + " of " + whose + " " + String(courses) + (onList === 1 ? " is on" : " are on");
}

/**
 * The Stats tab's numbers: where a member has played, joined to their
 * progress through the published lists, so a state shows both how many
 * courses they played there and how many of its "Best in" list; then how
 * their ranking compares with the lists.
 *
 * Args:
 *     rows: The member's courses, in rank order.
 *     entries: Every published ranking entry (`GET /v1/rankings`).
 *
 * Returns:
 *     The national lists always, each state the member has played in (never
 *     a state they haven't, however long its list), each country, and the
 *     comparisons that have something to say.
 *
 * Example:
 *     >>> profileStats(rows, entries).states[0]
 *     { key: "MI", name: "Michigan", courses: 14, top: { id: "…", name: "Oakland Hills", rank: 3 },
 *       list: { slug: "state-mi", title: "Best in Michigan", played: 13, size: 100, top: { … } } }
 */
export function profileStats(rows: readonly { course: Course; rank: number }[], entries: readonly PublishedEntry[]): ProfileStats {
  const refs: RankedRef[] = rows.map((row) => ({ id: row.course.id, name: row.course.name, rank: row.rank }));
  const lists = playedLists(refs, entries);
  const stateLists = new Map(lists.filter((list) => isStateList(list.type)).map((list) => [list.scope.toUpperCase(), list]));
  const national = lists.filter((list) => isNationalList(list.type));

  // Rows come in rank order, so the first course seen in a place is the member's top-ranked there.
  const topIn = new Map<string, RankedRef>();
  rows.forEach((row, index) => {
    const { country, state } = placesOf(row.course);
    const course = refs[index];
    if (!course) return;
    if (country && !topIn.has("country:" + country.key)) topIn.set("country:" + country.key, course);
    if (state && !topIn.has("state:" + state.key)) topIn.set("state:" + state.key, course);
  });
  const withTop = (kind: "country" | "state", place: PlaceCount): PlaceStat[] => {
    const top = topIn.get(kind + ":" + place.key);
    return top ? [{ ...place, top }] : [];
  };

  const { states, countries } = placeBreakdown(rows);
  const gem = hiddenGem(refs, lists);
  return {
    courses: rows.length,
    national: national.map(listProgress),
    states: states.flatMap((state) => {
      const list = stateLists.get(state.key);
      return withTop("state", state).map((place) => ({ ...place, list: list ? listProgress(list) : null }));
    }),
    countries: countries.flatMap((country) => withTop("country", country)),
    best: national.flatMap((list) => bestPlayed(list) ?? []),
    hiddenGem: gem,
    disagreement: widestGap(lists, (_higher, course) => course.id !== gem?.course.id),
  };
}
