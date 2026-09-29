import { describe, expect, it } from "vitest";
import type { CourseRankingRow, CourseRow } from "../db/schema";
import { courseView, rankSummaries, rankedCourses } from "./course-view";

const row = (overrides: Partial<CourseRow> = {}): CourseRow => ({
  id: "11111111-1111-4111-8111-111111111111",
  stableId: null,
  name: "Test Links",
  nameKey: "test links",
  city: "Detroit",
  state: "MI",
  country: "USA",
  logoUrl: null,
  websiteUrl: "https://example.com",
  isCustom: false,
  createdBy: null,
  createdAt: new Date(),
  ...overrides,
});

const ranking = (overrides: Partial<CourseRankingRow>): CourseRankingRow => ({
  id: "r",
  courseId: row().id,
  rankingType: "usa",
  rank: 5,
  scopeCode: "USA",
  source: "Golf Digest",
  sourceYear: 2024,
  sourceUrl: null,
  ...overrides,
});

describe("course view", () => {
  it("builds the location and region from the row", () => {
    expect(courseView(row())).toMatchObject({
      id: row().id,
      location: "Detroit, MI, USA",
      region: "michigan",
      website: "https://example.com",
    });
    expect(courseView(row({ state: "NY" })).region).toBe("usa");
    expect(courseView(row({ city: null, state: null, country: "Scotland" }))).toMatchObject({
      location: "Scotland",
      region: "international",
    });
  });

  it("applies canonical Scottish geography even when the row country is wrong", () => {
    expect(courseView(row({ name: "Balcomie Links", country: "USA" }))).toMatchObject({
      location: "Anstruther, Fife, Scotland",
      country: "UK",
    });
  });

  it("summarizes ranks per course and maps public and state lists", () => {
    const ohio = "22222222-2222-4222-8222-222222222222";
    const summaries = rankSummaries([
      ranking({ id: "a", rankingType: "world", rank: 3, scopeCode: "WORLD" }),
      ranking({ id: "b", rankingType: "usa_public", rank: 7, scopeCode: "USA_PUBLIC" }),
      ranking({ id: "c", rankingType: "state", rank: 2, scopeCode: "MI" }),
      ranking({ id: "d", courseId: ohio, rankingType: "state", rank: 9, scopeCode: "OH" }),
    ]);
    expect(summaries.get(row().id)).toEqual({ world: 3, public: 7, state: 2, michigan: 2 });
    expect(summaries.get(ohio)).toEqual({ state: 9 });
  });

  it("carries the state rank on the course view", () => {
    expect(courseView(row({ state: "OH" }), { state: 9 })).toMatchObject({ stateRank: 9, michigan: null });
    expect(courseView(row()).stateRank).toBeNull();
  });

  it("drops rankings whose course is unknown", () => {
    const courses = new Map([[row().id, courseView(row())]]);
    const rows = rankedCourses(
      [ranking({ id: "a" }), ranking({ id: "b", courseId: "missing" })],
      courses,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rank: 5, type: "usa", scope: "USA" });
  });
});
