import { describe, expect, it } from "vitest";
import {
  extractCourses,
  matchesQuery,
  parseAPICourse,
  parseCSV,
} from "./opengolf";

describe("OpenGolfAPI parsing", () => {
  it.each([
    ["bare array", [{ name: "A" }]],
    ["courses envelope", { courses: [{ name: "A" }] }],
    ["results envelope", { results: [{ name: "A" }] }],
    ["items envelope", { items: [{ name: "A" }] }],
    ["nested data.courses", { data: { courses: [{ name: "A" }] } }],
    ["data array", { data: [{ name: "A" }] }],
  ])("extracts courses from a %s", (_label, payload) => {
    expect(extractCourses(payload)).toEqual([{ name: "A" }]);
  });

  it("returns no courses for an unknown envelope", () => {
    expect(extractCourses({ meta: {} })).toEqual([]);
  });

  it("parses quoted CSV fields, doubled quotes and CRLF endings", () => {
    const csv =
      'id,name,city\r\nalpha,"Alpha, ""Old"" Links",Detroit\r\n,,\r\nbeta,Beta Links,\r\n';
    expect(parseCSV(csv)).toEqual([
      { id: "alpha", name: 'Alpha, "Old" Links', city: "Detroit" },
      { id: "beta", name: "Beta Links", city: "" },
    ]);
  });

  it("skips empty aliases and falls back through field names", () => {
    expect(
      parseAPICourse({ name: "", course_name: "Actual Name", id: "", course_id: 99 }),
    ).toMatchObject({ id: "99", name: "Actual Name" });
  });

  it("treats a missing country as the United States and tags Michigan", () => {
    expect(parseAPICourse({ name: "Home", city: "Ann Arbor", state: "MI" })).toMatchObject(
      { country: "USA", state: "MI", region: "michigan", location: "Ann Arbor, MI" },
    );
    expect(
      parseAPICourse({ name: "Links", city: "St Andrews", country: "Scotland" }),
    ).toMatchObject({ country: "Scotland", state: "", region: "international" });
  });

  it("derives a stable id when the record has none", () => {
    const a = parseAPICourse({ name: "Pine Valley", city: "Pine Valley", state: "NJ" });
    const b = parseAPICourse({ name: "Pine Valley", city: "Pine Valley", state: "NJ" });
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^api-/);
  });

  it("requires every query term to appear in the course name", () => {
    const row = { name: "Arcadia Bluffs Golf Club" };
    expect(matchesQuery(row, "arcadia bluffs")).toBe(true);
    expect(matchesQuery(row, "Bluffs")).toBe(true);
    expect(matchesQuery(row, "arcadia south")).toBe(false);
    expect(matchesQuery(row, "")).toBe(false);
  });
});
