import { describe, expect, it } from "vitest";
import { courseSchema, RegionFilter } from "./course";
import { matchesRegion, missingUSState } from "./geography";

describe("My List region matching", () => {
  it("uses location even when country metadata is wrong", () => {
    const course = courseSchema.parse({
      id: "a",
      name: "Test",
      location: "Dundee, Scotland",
      country: "USA",
    });
    expect(matchesRegion(course, RegionFilter.World, "")).toBe(true);
    expect(matchesRegion(course, RegionFilter.USA, "")).toBe(false);
  });

  it.each(["Austin, Texas", "Austin, tx", "Austin, TX, USA"])(
    "recognizes the state from %s",
    (location) => {
      expect(
        matchesRegion(
          courseSchema.parse({ id: "a", name: "Test", location }),
          RegionFilter.State,
          "TX",
        ),
      ).toBe(true);
    },
  );
});

describe("U.S. state requirement", () => {
  it.each([
    ["a U.S. course with a state", { location: "Austin, TX, USA", country: "USA", state: "TX" }, false],
    ["a U.S. location naming the state", { location: "Austin, Texas" }, false],
    ["a U.S. course without a state", { location: "Somewhere, USA", country: "USA" }, true],
    ["a course abroad", { location: "Dundee, Scotland", country: "Scotland" }, false],
  ])("%s -> %s", (_label, fields, expected) => {
    expect(missingUSState(courseSchema.parse({ id: "a", name: "Test", ...fields }))).toBe(expected);
  });
});
