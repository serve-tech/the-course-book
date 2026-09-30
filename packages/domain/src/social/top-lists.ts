import { stateName } from "../catalog/geography";

/**
 * Published consensus lists as checklists ("Top lists"): titles and a
 * member's progress through each, computed from the published entries and
 * the courses on the member's personal list. Every course on a list has at
 * least one round, so being on the list means played.
 */

/** One published ranking entry, as `GET /v1/rankings` returns it. */
export interface TopListEntry {
  courseId: string;
  /** Published list: world, usa, usa_public or state; new values may appear. */
  type: string;
  /** WORLD, USA, USA_PUBLIC or a two-letter state code. */
  scope: string;
}

export interface TopListProgress {
  type: string;
  scope: string;
  title: string;
  size: number;
  played: number;
}

/** Display order of the national lists; state lists follow, alphabetically. */
const NATIONAL: readonly string[] = ["usa", "world", "usa_public"];

/**
 * A list's display title.
 *
 * Example:
 *     >>> topListTitle("state", "FL")
 *     "Best in Florida"
 */
export function topListTitle(type: string, scope: string): string {
  switch (type) {
    case "world":
      return "World Top 100";
    case "usa":
      return "USA Top 100";
    case "usa_public":
      return "USA Public Top 100";
    case "state":
      return "Best in " + stateName(scope.toUpperCase());
    default:
      return scope;
  }
}

/**
 * Progress through every published list the member should see.
 *
 * Args:
 *     entries: Every published ranking entry.
 *     played: Ids of the courses on the member's list.
 *
 * Returns:
 *     The national lists always, then each state list the member has played
 *     at least one course from. National lists come first in a fixed order
 *     (USA, World, USA Public), then states by title.
 */
export function topListProgress(entries: readonly TopListEntry[], played: ReadonlySet<string>): TopListProgress[] {
  const lists = new Map<string, TopListProgress>();
  for (const entry of entries) {
    const key = entry.type + ":" + entry.scope;
    const list = lists.get(key) ?? { type: entry.type, scope: entry.scope, title: topListTitle(entry.type, entry.scope), size: 0, played: 0 };
    list.size++;
    if (played.has(entry.courseId)) list.played++;
    lists.set(key, list);
  }
  return [...lists.values()]
    .filter((list) => NATIONAL.includes(list.type) || list.played > 0)
    .sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));
}

function order(list: TopListProgress): number {
  const index = NATIONAL.indexOf(list.type);
  return index === -1 ? NATIONAL.length : index;
}
