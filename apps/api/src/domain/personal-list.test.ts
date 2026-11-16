import { describe, expect, it } from "vitest";
import { rankOrBelow, splitList, type MembershipRow } from "./personal-list";

const at = (iso: string) => new Date(iso);
const row = (id: string, rank: number | null, updatedAt = "2026-11-01T00:00:00Z", name = id.toUpperCase()): MembershipRow => ({
  course: { id, name },
  rank,
  updatedAt: at(updatedAt),
});

describe("splitting a list into the ranking and Played", () => {
  it("puts Ranked courses in rank order and leaves Played ones out of the ranking", () => {
    const { ranked, unranked } = splitList([row("c", 3), row("p", null), row("a", 1), row("b", 2)]);
    expect(ranked.map((entry) => [entry.course.id, entry.rank])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    expect(unranked.map((entry) => entry.course.id)).toEqual(["p"]);
  });

  it.each([
    [
      "most recently Played first",
      [row("old", null, "2026-11-01T00:00:00Z"), row("new", null, "2026-11-03T00:00:00Z"), row("mid", null, "2026-11-02T00:00:00Z")],
      ["new", "mid", "old"],
    ],
    [
      "by name when they became Played together",
      [row("x", null, "2026-11-01T00:00:00Z", "Pine Valley"), row("y", null, "2026-11-01T00:00:00Z", "Augusta National")],
      ["y", "x"],
    ],
    [
      "by id when the name is the same too",
      [row("b", null, "2026-11-01T00:00:00Z", "Same"), row("a", null, "2026-11-01T00:00:00Z", "Same")],
      ["a", "b"],
    ],
  ])("orders Played courses %s", (_case, rows, expected) => {
    expect(splitList(rows).unranked.map((entry) => entry.course.id)).toEqual(expected);
  });

  it("handles a list with nothing Ranked, or nothing Played", () => {
    expect(splitList([row("p", null)]).ranked).toEqual([]);
    expect(splitList([row("a", 1)]).unranked).toEqual([]);
    expect(splitList([])).toEqual({ ranked: [], unranked: [] });
  });

  it("keeps each row's own fields", () => {
    const rich = { ...row("a", 1), played: 4 };
    expect(splitList([rich]).ranked[0]).toBe(rich);
  });
});

describe("a rank for a field that cannot be null", () => {
  it.each([
    [4, 10, 4],
    [null, 10, 11],
    [null, 0, 1],
  ])("reports rank %s in a ranking of %s as %s", (rank, size, expected) => {
    expect(rankOrBelow(rank, size)).toBe(expected);
  });
});
