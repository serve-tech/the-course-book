import { describe, expect, it } from "vitest";
import { compareRankings, type SharedCourse } from "./compare";

const course = (courseId: string, myRank: number, theirRank: number): SharedCourse => ({ courseId, myRank, theirRank });

describe("compareRankings", () => {
  it("reports nothing to compare without shared courses", () => {
    expect(compareRankings([], 10, 20)).toEqual({ inCommon: 0, agreement: null, biggestSplit: null });
  });

  it.each([
    ["one shared course", [course("a", 1, 1)]],
    ["two shared courses", [course("a", 1, 2), course("b", 2, 1)]],
  ])("withholds agreement with %s", (_label, shared) => {
    expect(compareRankings(shared, 5, 5).agreement).toBeNull();
  });

  it.each([
    ["identical order", [course("a", 1, 1), course("b", 2, 2), course("c", 3, 3)], 1],
    ["reversed order", [course("a", 1, 3), course("b", 2, 2), course("c", 3, 1)], 0],
    // Pairs ab (agree), ac (agree), bc (disagree): 2 of 3.
    ["one swapped pair", [course("a", 1, 1), course("b", 2, 3), course("c", 3, 2)], 2 / 3],
    // Order is what counts, not the gaps between ranks.
    ["same order, different gaps", [course("a", 1, 10), course("b", 5, 20), course("c", 9, 90)], 1],
  ])("scores %s", (_label, shared, agreement) => {
    expect(compareRankings(shared, 100, 100).agreement).toBeCloseTo(agreement);
  });

  it("finds the biggest split by percentile, not by raw rank", () => {
    // "b" is #9 of 10 for me and #9 of 100 for them: a big split in position.
    // "a" differs by 20 raw ranks but sits at 0.3 vs 0.5.
    const shared = [course("a", 3, 50), course("b", 9, 9)];
    expect(compareRankings(shared, 10, 100).biggestSplit).toEqual({ courseId: "b", myRank: 9, theirRank: 9 });
  });

  it("breaks ties toward the course both rank higher, then by id", () => {
    const shared = [course("z", 3, 1), course("y", 1, 3), course("x", 4, 2)];
    // Gaps: z = 0.2, y = 0.2, x = 0.2 (lists of 10); combined ranks 4, 4, 6.
    expect(compareRankings(shared, 10, 10).biggestSplit?.courseId).toBe("y");
  });

  it("has no split when every shared course sits at the same position", () => {
    expect(compareRankings([course("a", 1, 1), course("b", 2, 2)], 10, 10).biggestSplit).toBeNull();
  });
});
