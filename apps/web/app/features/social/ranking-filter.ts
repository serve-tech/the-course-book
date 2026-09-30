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
