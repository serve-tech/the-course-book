import type { TopListStanding } from "@coursebook/domain/social/types";

/**
 * Which published list Home leads with, and why. Home shows one list's
 * progress as its focal point (decision 2026-10-27): people work harder as a
 * goal gets close, so Home picks a list the member has started and can see
 * the end of, rather than whichever list comes first.
 */

/** Why Home shows the list it does; it sets the line above the count. */
export enum GoalReason {
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
 *
 * Returns:
 *     In order of preference: the home-state list when the member has started
 *     but not finished it; the unfinished started list with the largest share
 *     played (ties go to more courses played, then display order); the
 *     home-state list even when unstarted; the first list. Lists with no
 *     courses are never chosen. Null when there is no list at all.
 *
 * Example:
 *     >>> chooseGoalList([world(5, 100), michigan(13, 100)], "MI").reason
 *     "home-state"
 */
export function chooseGoalList(standings: readonly TopListStanding[], homeState: string): GoalList | null {
  const lists = standings.filter((standing) => standing.list.size > 0);
  const state = homeState.toUpperCase();
  const home = state ? lists.find((standing) => standing.list.type === "state" && standing.list.scope.toUpperCase() === state) : undefined;
  if (home && inProgress(home)) return { standing: home, reason: GoalReason.HomeState };
  const closest = lists.filter(inProgress).reduce<TopListStanding | null>((best, standing) => (best === null || closer(standing, best) ? standing : best), null);
  if (closest) return { standing: closest, reason: GoalReason.Closest };
  if (home) return { standing: home, reason: GoalReason.HomeState };
  const first = lists[0];
  return first ? { standing: first, reason: GoalReason.FirstList } : null;
}

function inProgress(standing: TopListStanding): boolean {
  return standing.mine > 0 && standing.mine < standing.list.size;
}

/** Whether `a` has a larger share played than `b`, compared without floating point; more played breaks a tie. */
function closer(a: TopListStanding, b: TopListStanding): boolean {
  const difference = a.mine * b.list.size - b.mine * a.list.size;
  return difference > 0 || (difference === 0 && a.mine > b.mine);
}
