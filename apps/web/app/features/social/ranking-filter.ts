import type { MemberListRow } from "@coursebook/domain/friends/types";
import { countLabel } from "../../shared/lib/count-label";

/** Which of a friend's courses to show. */
export enum RankingFilter {
  All = "all",
  Both = "both",
  OnlyThem = "them",
}

/** Rows a filter keeps: all, the ones both have played, or only theirs. */
export function filterRanking(rows: readonly MemberListRow[], filter: RankingFilter): MemberListRow[] {
  if (filter === RankingFilter.Both) return rows.filter((row) => row.onMyList);
  if (filter === RankingFilter.OnlyThem) return rows.filter((row) => !row.onMyList);
  return [...rows];
}

/**
 * The filter buttons on a friend's ranking, each with how many courses it
 * keeps, e.g. "Both played (3)". Counts cover the region's rows and ignore
 * the search, as the Courses page's do.
 *
 * @param rows - The friend's rows in the current region.
 * @param name - The friend's display name, for "Only {name}".
 * @returns Each filter with its button label, in display order.
 */
export function rankingFilterOptions(rows: readonly MemberListRow[], name: string): [RankingFilter, string][] {
  return [
    [RankingFilter.All, countLabel("All", rows.length)],
    [RankingFilter.Both, countLabel("Both played", filterRanking(rows, RankingFilter.Both).length)],
    [RankingFilter.OnlyThem, countLabel("Only " + name, filterRanking(rows, RankingFilter.OnlyThem).length)],
  ];
}

/**
 * What an empty friend's ranking says. A search that finds nothing says so
 * whatever the filter; otherwise the filter explains why nothing is left.
 */
export function emptyRankingMessage(filter: RankingFilter, searching: boolean): string {
  if (!searching && filter === RankingFilter.Both) return "You haven't played any of these yet.";
  if (!searching && filter === RankingFilter.OnlyThem) return "You've played every one of these.";
  return "No courses here match.";
}
