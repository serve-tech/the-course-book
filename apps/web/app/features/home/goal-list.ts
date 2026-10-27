import { isNationalList } from "@coursebook/domain/social/top-lists";
import type { TopListCourse, TopListStanding } from "@coursebook/domain/social/types";
import { sameList, topListSlug } from "../top-lists/lists";

/**
 * Which published list Home leads with, and why. Home shows one list's
 * progress as its focal point (decision 2026-10-27): people work harder as a
 * goal gets close, so by default Home picks a list the member has started and
 * can see the end of. Members can pick another; their pick wins.
 */

/** Why Home shows the list it does; it sets the line above the count. */
export enum GoalReason {
  /** The member picked it from Home's list strip. */
  Chosen = "chosen",
  /** The Best in State list for the member's chosen or detected state. */
  HomeState = "home-state",
  /** The started list with the largest share played. */
  Closest = "closest",
  /** Nothing is started and no home state is known: the first list in display order. */
  FirstList = "first-list",
}

export interface GoalList {
  standing: TopListStanding;
  reason: GoalReason;
}

/**
 * Choose the list Home leads with.
 *
 * Args:
 *     standings: Every published list with the member's progress, in the
 *         API's display order (national lists first).
 *     homeState: The two-letter state Best in State uses ("" when unknown).
 *     chosen: The slug of the list the member picked (`usa`, `state-mi`),
 *         or null. A slug naming no list with courses is ignored.
 *
 * Returns:
 *     In order of preference: the member's pick; the home-state list when the
 *     member has started but not finished it; the unfinished started list
 *     with the largest share played (ties go to more courses played, then
 *     display order); the home-state list even when unstarted; the first
 *     list. Lists with no courses are never chosen. Null when there is no
 *     list at all.
 *
 * Example:
 *     >>> chooseGoalList([world, michigan], "MI", null).reason
 *     "home-state"
 */
export function chooseGoalList(standings: readonly TopListStanding[], homeState: string, chosen: string | null = null): GoalList | null {
  const lists = standings.filter((standing) => standing.list.size > 0);
  const picked = chosen ? lists.find((standing) => topListSlug(standing.list) === chosen.toLowerCase()) : undefined;
  if (picked) return { standing: picked, reason: GoalReason.Chosen };
  const home = homeList(lists, homeState);
  if (home && inProgress(home)) return { standing: home, reason: GoalReason.HomeState };
  const closest = lists.filter(inProgress).reduce<TopListStanding | null>((best, standing) => (best === null || closer(standing, best) ? standing : best), null);
  if (closest) return { standing: closest, reason: GoalReason.Closest };
  if (home) return { standing: home, reason: GoalReason.HomeState };
  const first = lists[0];
  return first ? { standing: first, reason: GoalReason.FirstList } : null;
}

/**
 * The lists Home offers to track, in display order: the national lists, the
 * home-state list, and the current goal when it is another state's. Fifty
 * state lists would bury the choice, so other states are reached from Courses.
 */
export function goalChoices(standings: readonly TopListStanding[], homeState: string, goal: GoalList | null): TopListStanding[] {
  const home = homeList(standings, homeState);
  return standings.filter(
    (standing) =>
      standing.list.size > 0 &&
      (isNationalList(standing.list.type) || standing === home || (goal !== null && sameList(standing.list, goal.standing.list))),
  );
}

/**
 * What to play next on a list: courses the member has not played, those on
 * their Want to play list first, then in list order.
 */
export function upNext(entries: readonly TopListCourse[], limit: number): TopListCourse[] {
  return entries
    .filter((entry) => entry.played === 0)
    .sort((a, b) => Number(b.wantToPlay) - Number(a.wantToPlay) || a.rank - b.rank)
    .slice(0, limit);
}

function homeList(standings: readonly TopListStanding[], homeState: string): TopListStanding | undefined {
  const state = homeState.toUpperCase();
  return state ? standings.find((standing) => standing.list.type === "state" && standing.list.scope.toUpperCase() === state && standing.list.size > 0) : undefined;
}

function inProgress(standing: TopListStanding): boolean {
  return standing.mine > 0 && standing.mine < standing.list.size;
}

/** Whether `a` has a larger share played than `b`, compared without floating point; more played breaks a tie. */
function closer(a: TopListStanding, b: TopListStanding): boolean {
  const difference = a.mine * b.list.size - b.mine * a.list.size;
  return difference > 0 || (difference === 0 && a.mine > b.mine);
}
