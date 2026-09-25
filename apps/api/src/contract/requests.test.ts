import { describe, expect, it } from "vitest";
import { toCourseInput } from "./requests";
import { AddCourseRequestSchema } from "./schemas";

describe("add-course request mapping", () => {
  it("keeps a search hit's location and marks it not custom", () => {
    const body = AddCourseRequestSchema.parse({
      source: "search",
      course: { name: "Arcadia Bluffs", location: "Arcadia, MI, USA", city: "Arcadia", state: "MI", country: "USA", logoUrl: null, websiteUrl: "https://ab.com" },
    });
    expect(toCourseInput(body)).toEqual({
      name: "Arcadia Bluffs",
      location: "Arcadia, MI, USA",
      city: "Arcadia",
      state: "MI",
      country: "USA",
      logo: "",
      website: "https://ab.com",
      isCustom: false,
    });
  });

  it("composes a manual course's location and treats null and missing alike", () => {
    const fromNulls = toCourseInput(
      AddCourseRequestSchema.parse({ source: "manual", course: { name: "Backyard Nine", city: "Hometown", state: "OH", country: "USA", location: null } }),
    );
    const fromMissing = toCourseInput(
      AddCourseRequestSchema.parse({ source: "manual", course: { name: "Backyard Nine", city: "Hometown", state: "OH", country: "USA" } }),
    );
    expect(fromNulls).toEqual(fromMissing);
    expect(fromNulls).toMatchObject({ location: "Hometown, OH, USA", isCustom: true, logo: "", website: "" });
  });

  it.each([
    ["an empty name", { name: "  ", country: "USA" }, "Enter a course name."],
    ["no country", { name: "Links", country: "" }, "Select a country."],
  ])("rejects %s with a readable message", (_label, course, message) => {
    const result = AddCourseRequestSchema.safeParse({ source: "manual", course });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });
});
