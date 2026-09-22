import { describe, it, expect } from "vitest";
import { RankingFilter, courseSchema, type RankedCourse } from "./course";
import { selectRankings } from "./ranking-selectors";
const rows = (count: number, type = "world"): RankedCourse[] =>
  Array.from({ length: count }, (_, index) => ({
    course: courseSchema.parse({
      id: String(index),
      name: "Course " + String(index),
      location: "Michigan",
    }),
    rank: index + 1,
    type,
    scope: "MI",
  }));
describe("published ranking completeness and progress", () => {
  it.each([0, 99, 100])("requires exactly 100 world ranks (%i)", (count) => {
    expect(
      selectRankings(rows(count), RankingFilter.World, "", "", false, {})
        .complete,
    ).toBe(count === 100);
  });
  it("rejects duplicate ranks", () => {
    const data = rows(100);
    if (data[99]) data[99].rank = 1;
    expect(
      selectRankings(data, RankingFilter.World, "", "", false, {}).complete,
    ).toBe(false);
  });
  it("accepts a smaller state list", () => {
    expect(
      selectRankings(
        rows(30, "state"),
        RankingFilter.State,
        "MI",
        "",
        false,
        {},
      ).complete,
    ).toBe(true);
  });
  it("calculates progress before search and mine filters", () => {
    const result = selectRankings(
      rows(100),
      RankingFilter.World,
      "",
      "Course 1",
      true,
      { "0": 1, "1": 2 },
    );
    expect(result.total).toBe(100);
    expect(result.played).toBe(2);
    expect(result.rows.map((row) => row.course.id)).toEqual(["1"]);
  });
});
