import type { MemberListRow } from "@coursebook/domain/friends/types";

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
 * What an empty friend's ranking says. A search that finds nothing says so
 * whatever the filter; otherwise the filter explains why nothing is left.
 */
export function emptyRankingMessage(filter: RankingFilter, searching: boolean): string {
  if (!searching && filter === RankingFilter.Both) return "You haven't played any of these yet.";
  if (!searching && filter === RankingFilter.OnlyThem) return "You've played every one of these.";
  return "No courses here match.";
}
