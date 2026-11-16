import { describe, expect, it } from "vitest";
import { clampRank, insertAt, insertionRank, placeInRanking, reorder } from "./reorder";

describe("personal order", () => {
  it("does not drop hidden courses during a move", () => {
    const list = ["a", "hidden", "b"];
    expect(reorder(list, "b", 1)).toEqual(["b", "a", "hidden"]);
    expect(list).toEqual(["a", "hidden", "b"]);
  });

  it.each([
    [0, 1],
    [-4, 1],
    [Number.NaN, 1],
    [2.9, 2],
    [99, 3],
  ])("clamps a requested rank of %s to %s in a list of three", (requested, rank) => {
    expect(clampRank(requested, 3)).toBe(rank);
    expect(reorder(["a", "b", "c"], "c", requested).indexOf("c")).toBe(rank - 1);
  });

  it("leaves the order untouched for an unknown id", () => {
    expect(reorder(["a", "b"], "zzz", 1)).toEqual(["a", "b"]);
  });

  it("inserts a new course at the bottom by default and clamps explicit ranks", () => {
    expect(insertionRank(undefined, 3)).toBe(4);
    expect(insertionRank(null, 0)).toBe(1);
    expect(insertionRank(2, 3)).toBe(2);
    expect(insertionRank(10, 3)).toBe(4);
    expect(insertAt(["a", "b"], "c", null)).toEqual(["a", "b", "c"]);
    expect(insertAt(["a", "b"], "c", 1)).toEqual(["c", "a", "b"]);
    expect(insertAt(["a", "b"], "a", 2)).toEqual(["b", "a"]);
  });
});

describe("placing a course in the ranking", () => {
  const ranking = ["a", "b", "c"] as const;

  it.each([
    [1, ["new", "a", "b", "c"]],
    [2, ["a", "new", "b", "c"]],
    [4, ["a", "b", "c", "new"]],
    [99, ["a", "b", "c", "new"]],
    [0, ["new", "a", "b", "c"]],
    [-3, ["new", "a", "b", "c"]],
    [Number.NaN, ["new", "a", "b", "c"]],
    [2.7, ["a", "new", "b", "c"]],
  ])("inserts a course not in the ranking at %s", (rank, expected) => {
    expect(placeInRanking(ranking, "new", rank)).toEqual(expected);
  });

  it.each([
    ["c", 1, ["c", "a", "b"]],
    ["a", 3, ["b", "c", "a"]],
    ["a", 99, ["b", "c", "a"]],
    ["b", 2, ["a", "b", "c"]],
  ])("moves ranked %s to %s exactly as reorder does", (id, rank, expected) => {
    expect(placeInRanking(ranking, id, rank)).toEqual(expected);
    expect(placeInRanking(ranking, id, rank)).toEqual(reorder(ranking, id, rank));
  });

  it("places the first course of an empty ranking at 1", () => {
    expect(placeInRanking([], "new", 5)).toEqual(["new"]);
  });

  it("never mutates the ranking it was given", () => {
    const input = ["a", "b"];
    placeInRanking(input, "new", 1);
    placeInRanking(input, "b", 1);
    expect(input).toEqual(["a", "b"]);
  });
});
