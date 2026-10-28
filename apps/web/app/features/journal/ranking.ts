import { RegionFilter, type Course } from "@coursebook/domain/catalog/course";
import { matchesRegion, stateName } from "@coursebook/domain/catalog/geography";

/**
 * Pure rules for the Ranking tab, the member's own and a friend's: which
 * region tabs exist and what they are called, which rows a tab and search
 * keep, and how a play count reads.
 */

/**
 * The region tabs in order. `RegionFilter.World` means outside the US, so
 * its tab is "International", as on the Courses page, where "World" is
 * GOLF Magazine's list that includes US courses.
 */
export const RANKING_TABS: readonly RegionFilter[] = [RegionFilter.All, RegionFilter.USA, RegionFilter.World, RegionFilter.State];

/** A tab's name; the state tab names the chosen state, like the Courses page. */
export function rankingTabLabel(tab: RegionFilter, state: string): string {
  switch (tab) {
    case RegionFilter.All:
      return "All";
    case RegionFilter.USA:
      return "USA";
    case RegionFilter.World:
      return "International";
    case RegionFilter.State:
      return state ? "Best in " + stateName(state) : "Best in State";
  }
}

/** What a Ranking tab shows: a region, the state for the state tab, and a search. */
export interface RankingView {
  region: RegionFilter;
  /** Two-letter state code for the state tab; "" when none is chosen, which shows nothing there. */
  state: string;
  query: string;
}

/**
 * Rows in the region whose course name or place contains the search,
 * ignoring case, in the order given.
 */
export function rankingRows<T extends { course: Course }>(rows: readonly T[], view: RankingView): T[] {
  const search = view.query.trim().toLowerCase();
  return rows.filter(
    ({ course }) =>
      matchesRegion(course, view.region, view.state) &&
      (!search || course.name.toLowerCase().includes(search) || course.location.toLowerCase().includes(search)),
  );
}

/** "1 round", "3 rounds". */
export function roundsLabel(count: number): string {
  return String(count) + (count === 1 ? " round" : " rounds");
}

/** "1 course", "42 courses". */
export function coursesLabel(count: number): string {
  return String(count) + (count === 1 ? " course" : " courses");
}
