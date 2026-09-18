import { describe, it, expect } from "vitest";
import { courseSchema, RegionFilter } from "./course";
import { combineSearchResults } from "./search-results";
import { matchesRegion } from "./geography";
import { parseAPICourse } from "./search-service";
describe("search identity and geography", () => {
  it("uses richer display metadata without replacing local identity", () => {
    const local = courseSchema.parse({
      id: "custom-a",
      name: "Ranch Creek",
      location: "USA",
    });
    const remote = courseSchema.parse({
      id: "99",
      name: "Ranch Creek",
      location: "Town, TX, USA",
      city: "Town",
      state: "TX",
      country: "USA",
    });
    expect(combineSearchResults([local], [remote])).toEqual([
      { course: local, display: remote },
    ]);
  });
  it("skips empty API aliases", () => {
    expect(
      parseAPICourse({
        name: "",
        course_name: "Actual Name",
        id: "",
        course_id: 99,
      }).name,
    ).toBe("Actual Name");
  });
  it("uses location for My List geography even when country metadata is wrong", () => {
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
    "recognizes journal state from %s",
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
