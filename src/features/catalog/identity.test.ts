import { describe, it, expect } from "vitest";
import { courseSchema, normalizeName } from "./course";
import { canonicalize, equivalentCourses, resolveRanked } from "./identity";
import bundled from "./bundled-courses.json";
const catalog = bundled.map((course) => courseSchema.parse(course));
describe("course identity compatibility", () => {
  it("preserves numbered layouts", () => {
    expect(normalizeName("Pinehurst No. 2")).toBe("pinehurst 2");
    expect(normalizeName("Pinehurst No. 4")).not.toBe(
      normalizeName("Pinehurst No. 2"),
    );
  });
  it("canonicalizes known Scottish courses even when cloud country is wrong", () => {
    expect(
      canonicalize(
        courseSchema.parse({
          id: "custom",
          name: "Balcomie Links",
          location: "USA",
          country: "USA",
        }),
      ),
    ).toMatchObject({
      location: "Anstruther, Fife, Scotland",
      country: "UK",
      state: "",
    });
  });
  it("keeps distinct Arcadia layouts and preserves the strict fuzzy threshold", () => {
    expect(resolveRanked(catalog, "Arcadia Bluffs Golf Club", "MI")?.id).toBe(
      "michigan11",
    );
    expect(
      resolveRanked(catalog, "Arcadia Bluffs South Course", "MI")?.id,
    ).toBe("michigan9");
    expect(
      resolveRanked(
        catalog,
        "American Dunes Golf Club",
        "Grand Haven, Michigan",
        true,
      )?.name,
    ).not.toBe("Dunes Club");
  });
  it("deduplicates sparse compatible locations without conflating states", () => {
    const course = (location: string) =>
      courseSchema.parse({ id: location, name: "Same Name", location });
    expect(equivalentCourses(course("USA"), course("City, TX, USA"))).toBe(
      true,
    );
    expect(
      equivalentCourses(course("City, MI, USA"), course("City, TX, USA")),
    ).toBe(false);
  });
});
