import { courseSchema } from "@coursebook/domain/catalog/course";
import { describe, expect, it } from "vitest";
import { nationalProgress, placeStats, type RankedPlay } from "./stats";

const row = (id: string, played: number, place: Record<string, unknown>): RankedPlay => ({
  course: courseSchema.parse({ id, name: "Course " + id, location: "", ...place }),
  played,
});

describe("profile stats", () => {
  const rows = [
    row("sand", 1, { country: "USA", state: "NE", usa: 8 }),
    row("arc", 5, { country: "USA", state: "MI", public: 16 }),
    row("kings", 2, { country: "USA", state: "MI" }),
    row("old", 5, { country: "Scotland", world: 3, global: 3 }),
    row("hague", 1, { country: "Netherlands", world: 1 }),
  ];

  it("counts national Top 100 courses from published ranks", () => {
    expect(nationalProgress(rows)).toEqual([
      { title: "World Top 100", played: 1, size: 100 },
      { title: "USA Top 100", played: 1, size: 100 },
      { title: "USA Public Top 100", played: 1, size: 100 },
      { title: "International Top 100", played: 2, size: 100 },
    ]);
  });

  it("counts states and countries and finds the most played course, ties to the higher rank", () => {
    const stats = placeStats(rows);
    expect(stats).toMatchObject({ states: 2, countries: 3, topState: "Michigan" });
    expect(stats.mostPlayed?.course.id).toBe("arc");
  });

  it("has nothing to say about an empty ranking", () => {
    expect(placeStats([])).toEqual({ states: 0, countries: 0, topState: null, mostPlayed: null });
  });
});
