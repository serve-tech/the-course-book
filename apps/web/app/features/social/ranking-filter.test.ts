import { courseSchema } from "@coursebook/domain/catalog/course";
import { describe, expect, it } from "vitest";
import { RankingFilter, filterRanking } from "./ranking-filter";

const row = (id: string, onMyList: boolean) => ({
  course: courseSchema.parse({ id, name: id, location: "" }),
  rank: 1,
  onMyList,
  played: 1,
  lastPlayedOn: null,
  myRank: onMyList ? 1 : null,
});

describe("filterRanking", () => {
  const rows = [row("a", true), row("b", false), row("c", true)];
  it.each([
    [RankingFilter.All, ["a", "b", "c"]],
    [RankingFilter.Both, ["a", "c"]],
    [RankingFilter.OnlyThem, ["b"]],
  ])("keeps %s rows", (filter, ids) => {
    expect(filterRanking(rows, filter).map((r) => r.course.id)).toEqual(ids);
  });
});
