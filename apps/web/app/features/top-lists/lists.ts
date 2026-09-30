import { normalizeName, type Course, type RankedCourse } from "@coursebook/domain/catalog/course";
import type { PublicMember } from "@coursebook/domain/friends/types";
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

/**
 * The tabs of the Courses page; national lists first, then the chosen
 * state's list. World is GOLF Magazine's list of every country (type
 * `global`); International is Golf Digest's World 100, which leaves out the
 * US (type `world`; decision 2026-09-30).
 */
export enum ListTab {
  World = "world",
  USA = "usa",
  Public = "usa-public",
  International = "international",
  State = "state",
}

const NATIONAL: Readonly<Record<Exclude<ListTab, ListTab.State>, TopListRef>> = {
  [ListTab.World]: { type: "global", scope: "GLOBAL" },
  [ListTab.USA]: { type: "usa", scope: "USA" },
  [ListTab.Public]: { type: "usa_public", scope: "USA_PUBLIC" },
  [ListTab.International]: { type: "world", scope: "WORLD" },
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

/** URL names of the national list types, as their tabs name them. */
const SLUGS: Readonly<Record<string, string>> = { global: "world", world: "international", usa: "usa", usa_public: "usa-public" };

/**
 * A list's name in URLs: `world`, `usa`, `usa-public`, `international`,
 * `state-mi`. A list type added later gets its type with dashes.
 *
 * Example:
 *     >>> topListSlug({ type: "state", scope: "MI" })
 *     "state-mi"
 */
export function topListSlug(list: TopListRef): string {
  if (list.type === "state") return "state-" + list.scope.toLowerCase();
  return SLUGS[list.type] ?? list.type.replace(/_/g, "-");
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

/** The remembered tab, or the World Top 100 when nothing (or something unknown) is stored. */
export function parseListTab(value: string): ListTab {
  return (Object.values(ListTab) as string[]).includes(value) ? (value as ListTab) : ListTab.World;
}

/** The list a tab shows; the State tab needs a state and is null without one. */
export function tabList(tab: ListTab, state: string): TopListRef | null {
  if (tab === ListTab.State) return state ? { type: "state", scope: state.toUpperCase() } : null;
  return NATIONAL[tab];
}

/** The tab a list belongs to: its national tab, State for a state list, null for a list with no tab. */
export function listTab(list: TopListRef): ListTab | null {
  if (list.type === "state") return ListTab.State;
  const tabs: readonly (keyof typeof NATIONAL)[] = [ListTab.World, ListTab.USA, ListTab.Public, ListTab.International];
  return tabs.find((tab) => sameList(NATIONAL[tab], list)) ?? null;
}

/** Where the State tab points when no state is known yet. */
export const STATE_WITHOUT_SCOPE = "state";

/**
 * Which list the Courses page shows. A list named in the URL wins when it is
 * published (or the bare `state`, which asks for a state); otherwise the
 * tab remembered on this device, with `state` for Best in State.
 *
 * Args:
 *     options: `requested` is the URL's `list` (null when absent),
 *         `remembered` the stored tab, `state` the state to use for Best in
 *         State ("" when none), and `lists` every published list.
 */
export function chooseList(options: {
  requested: string | null;
  remembered: string;
  state: string;
  lists: readonly TopListRef[];
}): { tab: ListTab; list: TopListRef | null } {
  if (options.requested === STATE_WITHOUT_SCOPE) return { tab: ListTab.State, list: null };
  const named = options.requested ? findList(options.requested, options.lists) : null;
  const namedTab = named ? listTab(named) : null;
  if (named && namedTab) return { tab: namedTab, list: named };
  const tab = parseListTab(options.remembered);
  return { tab, list: tabList(tab, options.state) };
}

/**
 * The state whose Best-in-State list someone has played most of, for Best
 * in State when no state is chosen; ties go to the first state
 * alphabetically, "" when they have played none.
 */
export function busiestState(standings: readonly { list: TopListRef; mine: number }[]): string {
  const states = standings.filter((standing) => standing.list.type === "state" && standing.mine > 0);
  states.sort((a, b) => b.mine - a.mine || a.list.scope.localeCompare(b.list.scope));
  return states[0]?.list.scope.toUpperCase() ?? "";
}

/**
 * Whether a list's ranks make a complete list: the national lists need 100
 * distinct ranks, a state list at least one, all distinct (docs/architecture.md,
 * "Top lists").
 */
export function isCompleteList(list: TopListRef, ranks: readonly number[]): boolean {
  const distinct = new Set(ranks).size === ranks.length;
  return distinct && (list.type === "state" ? ranks.length > 0 : ranks.length === 100);
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
  return { entries, complete: isCompleteList(list, entries.map((row) => row.rank)) };
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
 * A course's rank on every list it is on: World, USA, USA Public,
 * International, then its state's Best-in-State list.
 *
 * Example:
 *     >>> rankBadges(augusta).map((badge) => `${badge.label} #${badge.rank}`)
 *     ["World #8", "USA #2", "Georgia #1"]
 */
export function rankBadges(course: Course): RankBadge[] {
  const badges: RankBadge[] = [];
  if (course.global !== null) badges.push({ list: NATIONAL[ListTab.World], label: "World", rank: course.global });
  if (course.usa !== null) badges.push({ list: NATIONAL[ListTab.USA], label: "USA", rank: course.usa });
  if (course.public !== null) badges.push({ list: NATIONAL[ListTab.Public], label: "USA Public", rank: course.public });
  if (course.world !== null) badges.push({ list: NATIONAL[ListTab.International], label: "International", rank: course.world });
  if (course.stateRank !== null && course.state)
    badges.push({ list: { type: "state", scope: course.state.toUpperCase() }, label: stateName(course.state.toUpperCase()), rank: course.stateRank });
  return badges;
}

/**
 * Whose personal ranking a rank is from, to label it: a member's own order
 * must never read like a published rank.
 *
 * Args:
 *     owner: The member's display name, or null for the viewer.
 *
 * Example:
 *     >>> rankingOwner("Dan Whitaker")
 *     "Dan Whitaker's ranking"
 */
export function rankingOwner(owner: string | null): string {
  return owner === null ? "Your ranking" : owner + "'s ranking";
}


/**
 * Who among the viewer's friends played a course, in words.
 *
 * Example:
 *     >>> friendsLine([priya, dan, kevin])
 *     "Priya and 2 other friends played it"
 */
export function friendsLine(friends: readonly PublicMember[]): string {
  const [first, second] = friends;
  if (!first) return "";
  const name = (member: PublicMember) => member.displayName || member.username;
  if (!second) return name(first) + " played it";
  if (friends.length === 2) return name(first) + " and " + name(second) + " played it";
  const others = friends.length - 1;
  return name(first) + " and " + String(others) + " other friend" + (others === 1 ? "" : "s") + " played it";
}
