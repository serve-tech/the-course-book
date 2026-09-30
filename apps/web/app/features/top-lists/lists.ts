import { normalizeName, type Course, type RankedCourse } from "@coursebook/domain/catalog/course";
import { stateName } from "@coursebook/domain/catalog/geography";

/**
 * Published Top lists as the web shows them: which lists exist, their
 * entries in rank order, filters, and a course's rank on every list it is
 * on ("World #3 · USA #2 · Georgia #1", like a recruit's overall, state and
 * position ranks).
 */

/** A published list, named as `GET /v1/rankings` names it. */
export interface TopListRef {
  /** world, usa, usa_public or state; new values may appear. */
  type: string;
  /** WORLD, USA, USA_PUBLIC or a two-letter state code. */
  scope: string;
}

/** The tabs of the Courses page; national lists first, then the chosen state's list. */
export enum ListTab {
  USA = "usa",
  Public = "usa-public",
  World = "world",
  State = "state",
}

const NATIONAL: Readonly<Record<Exclude<ListTab, ListTab.State>, TopListRef>> = {
  [ListTab.USA]: { type: "usa", scope: "USA" },
  [ListTab.Public]: { type: "usa_public", scope: "USA_PUBLIC" },
  [ListTab.World]: { type: "world", scope: "WORLD" },
};

/** Which courses to show: all, the ones played, or the ones still to play. */
export enum PlayedFilter {
  All = "all",
  Played = "played",
  NotPlayed = "not-played",
}

/** A course's rank on one list. */
export interface RankBadge {
  list: TopListRef;
  label: string;
  rank: number;
}

/** Whether two refs name the same list. */
export function sameList(a: TopListRef, b: TopListRef): boolean {
  return a.type === b.type && a.scope.toUpperCase() === b.scope.toUpperCase();
}

/**
 * A list's name in URLs: `usa`, `usa-public`, `world`, `state-mi`.
 *
 * Example:
 *     >>> topListSlug({ type: "state", scope: "MI" })
 *     "state-mi"
 */
export function topListSlug(list: TopListRef): string {
  return list.type === "state" ? "state-" + list.scope.toLowerCase() : list.type.replace(/_/g, "-");
}

/** The published list a URL names, or null when there is none. */
export function findList(slug: string, lists: readonly TopListRef[]): TopListRef | null {
  const wanted = slug.toLowerCase();
  return lists.find((list) => topListSlug(list) === wanted) ?? null;
}

/** Every published list in the entries, once each. */
export function availableLists(rows: readonly RankedCourse[]): TopListRef[] {
  const seen = new Map<string, TopListRef>();
  for (const row of rows) seen.set(row.type + ":" + row.scope.toUpperCase(), { type: row.type, scope: row.scope.toUpperCase() });
  return [...seen.values()];
}

/** The remembered tab, or the USA Top 100 when nothing (or something unknown) is stored. */
export function parseListTab(value: string): ListTab {
  return (Object.values(ListTab) as string[]).includes(value) ? (value as ListTab) : ListTab.USA;
}

/** The list a tab shows; the State tab needs a state and is null without one. */
export function tabList(tab: ListTab, state: string): TopListRef | null {
  if (tab === ListTab.State) return state ? { type: "state", scope: state.toUpperCase() } : null;
  return NATIONAL[tab];
}

/**
 * A list's entries in rank order, and whether the list is complete: the
 * national lists need 100 distinct ranks, a state list at least one entry
 * with distinct ranks (docs/architecture.md, "Rankings page").
 */
export function listEntries(rows: readonly RankedCourse[], list: TopListRef): { entries: RankedCourse[]; complete: boolean } {
  const entries = rows
    .filter((row) => sameList(row, list) && row.rank > 0 && (list.type === "state" || row.rank <= 100))
    .sort((a, b) => a.rank - b.rank);
  const distinct = new Set(entries.map((row) => row.rank)).size === entries.length;
  const complete = distinct && (list.type === "state" ? entries.length > 0 : entries.length === 100);
  return { entries, complete };
}

/**
 * Entries a filter and a search keep.
 *
 * Args:
 *     entries: One list's entries.
 *     options: `filter` against `played` (course ids someone played), and
 *         `query`, matched against name and location ignoring case and
 *         punctuation.
 */
export function filterEntries(
  entries: readonly RankedCourse[],
  options: { filter: PlayedFilter; played: ReadonlySet<string>; query: string },
): RankedCourse[] {
  const query = normalizeName(options.query);
  return entries.filter((row) => {
    const played = options.played.has(row.course.id);
    if (options.filter === PlayedFilter.Played && !played) return false;
    if (options.filter === PlayedFilter.NotPlayed && played) return false;
    return !query || normalizeName(row.course.name + " " + row.course.location).includes(query);
  });
}

/** How many entries someone has played. */
export function playedCount(entries: readonly RankedCourse[], played: ReadonlySet<string>): number {
  return entries.filter((row) => played.has(row.course.id)).length;
}

/**
 * A course's rank on every list it is on: World, USA, USA Public, then its
 * state's Best-in-State list.
 *
 * Example:
 *     >>> rankBadges(augusta).map((badge) => `${badge.label} #${badge.rank}`)
 *     ["USA #2", "Georgia #1"]
 */
export function rankBadges(course: Course): RankBadge[] {
  const badges: RankBadge[] = [];
  if (course.world !== null) badges.push({ list: NATIONAL[ListTab.World], label: "World", rank: course.world });
  if (course.usa !== null) badges.push({ list: NATIONAL[ListTab.USA], label: "USA", rank: course.usa });
  if (course.public !== null) badges.push({ list: NATIONAL[ListTab.Public], label: "USA Public", rank: course.public });
  if (course.stateRank !== null && course.state)
    badges.push({ list: { type: "state", scope: course.state.toUpperCase() }, label: stateName(course.state.toUpperCase()), rank: course.stateRank });
  return badges;
}

/**
 * A personal ranking pill's text, in the published pills' "{whose} #{n}"
 * form, so a member's own order is never mistaken for a published rank.
 *
 * Args:
 *     owner: The member's display name, or null for the viewer ("Your").
 *     rank: The course's position on that member's Ranking.
 *
 * Example:
 *     >>> personalRankLabel("Dan Whitaker", 3)
 *     "Dan Whitaker's ranking #3"
 */
export function personalRankLabel(owner: string | null, rank: number): string {
  return (owner === null ? "Your" : owner + "'s") + " ranking #" + String(rank);
}

/**
 * The US state where someone has played the most courses, for the Best in
 * State tab when no state is chosen. Ties go to the alphabetically first
 * state; "" when they have played no US course with a state.
 */
export function homeState(courses: readonly Course[]): string {
  const counts = new Map<string, number>();
  for (const course of courses) {
    const state = course.state.trim().toUpperCase();
    if (course.country === "USA" && state) counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}
