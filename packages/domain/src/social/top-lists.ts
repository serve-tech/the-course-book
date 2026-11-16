import { stateName } from "../catalog/geography";

/**
 * Published consensus lists as checklists ("Top lists"): their entries,
 * titles, kinds and display order. A member's progress through them is
 * counted where it is shown (the web's `features/social/stats.ts`).
 */

/** One published ranking entry, as `GET /v1/rankings` returns it. */
export interface TopListEntry {
  courseId: string;
  /** Published list: global, world, usa, usa_public or state; new values may appear. */
  type: string;
  /** WORLD, USA, USA_PUBLIC or a two-letter state code. */
  scope: string;
}

/** Display order of the national lists; state lists follow, alphabetically. */
const NATIONAL: readonly string[] = ["global", "usa", "usa_public", "world"];

/**
 * A list's display title.
 *
 * Example:
 *     >>> topListTitle("state", "FL")
 *     "Best in Florida"
 */
export function topListTitle(type: string, scope: string): string {
  switch (type) {
    case "global":
      return "World Top 100";
    case "world":
      return "International Top 100";
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

/** Whether a list is one of the national lists, which every member sees. */
export function isNationalList(type: string): boolean {
  return NATIONAL.includes(type);
}

/** Whether a list is a state's "Best in" list, whose scope is the state's two-letter code. */
export function isStateList(type: string): boolean {
  return type === "state";
}

/** Display order: the national lists in a fixed order, then the rest by title. */
export function compareTopLists(a: { type: string; title: string }, b: { type: string; title: string }): number {
  return order(a.type) - order(b.type) || a.title.localeCompare(b.title);
}

function order(type: string): number {
  const index = NATIONAL.indexOf(type);
  return index === -1 ? NATIONAL.length : index;
}
