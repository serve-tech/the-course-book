import { courseSchema } from "@coursebook/domain/catalog/course";
import { describe, expect, it } from "vitest";
import { RankingFilter, emptyRankingMessage, filterRanking } from "./ranking-filter";

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

describe("emptyRankingMessage", () => {
  it.each([
    [RankingFilter.All, false, "No courses here match."],
    [RankingFilter.Both, false, "You haven't played any of these yet."],
    [RankingFilter.OnlyThem, false, "You've played every one of these."],
    [RankingFilter.Both, true, "No courses here match."],
    [RankingFilter.OnlyThem, true, "No courses here match."],
  ])("%s, searching %s: %s", (filter, searching, message) => {
    expect(emptyRankingMessage(filter, searching)).toBe(message);
  });
});
