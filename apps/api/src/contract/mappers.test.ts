import { courseSchema } from "@coursebook/domain/catalog/course";
import { describe, expect, it } from "vitest";
import { UNKNOWN_LOCATION } from "../domain/course-view";
import {
  toContractCourse,
  toCourseDetails,
  toMemberList,
  toRankingEntry,
  toRound,
  toSearchHit,
} from "./mappers";
import {
  CourseSchema,
  MemberListSchema,
  RankingEntrySchema,
  RoundSchema,
  SearchHitSchema,
} from "./schemas";

const CATALOG_ID = "11111111-1111-4111-8111-111111111111";

const course = (overrides: Record<string, unknown> = {}) =>
  courseSchema.parse({
    id: CATALOG_ID,
    name: "Arcadia Bluffs",
    location: "Arcadia, MI, USA",
    city: "Arcadia",
    state: "MI",
    country: "USA",
    region: "michigan",
    world: 60,
    usa: 40,
    public: 12,
    michigan: 3,
    stateRank: 3,
    logo: "",
    website: "https://arcadiabluffs.com",
    ...overrides,
  });

describe("contract course mapping", () => {
  it("maps a catalog course and validates against the contract", () => {
    const mapped = toContractCourse(course());
    expect(mapped).toEqual({
      id: CATALOG_ID,
      name: "Arcadia Bluffs",
      location: "Arcadia, MI, USA",
      city: "Arcadia",
      state: "MI",
      country: "USA",
      logoUrl: null,
      websiteUrl: "https://arcadiabluffs.com",
      ranks: { world: 60, usa: 40, usaPublic: 12, state: 3 },
    });
    expect(CourseSchema.safeParse(mapped).success).toBe(true);
  });

  it.each([
    ["the placeholder location", { location: UNKNOWN_LOCATION }],
    ["an empty location", { location: "  " }],
  ])("reports %s as null", (_label, overrides) => {
    expect(toCourseDetails(course(overrides)).location).toBeNull();
  });

  it("turns empty strings into null and keeps the country", () => {
    expect(toCourseDetails(course({ city: "", state: "", country: "Scotland" }))).toMatchObject({
      city: null,
      state: null,
      country: "Scotland",
    });
  });
});

describe("search hit mapping", () => {
  it("carries the catalog id for a known course", () => {
    const hit = toSearchHit({ course: course(), display: course() });
    expect(hit.courseId).toBe(CATALOG_ID);
    expect(SearchHitSchema.safeParse(hit).success).toBe(true);
  });

  it("carries no id for a course outside the catalog", () => {
    const external = course({ id: "api-123", world: null, usa: null, public: null, michigan: null, stateRank: null });
    const hit = toSearchHit({ course: external, display: external });
    expect(hit.courseId).toBeNull();
    expect(hit.ranks).toEqual({ world: null, usa: null, usaPublic: null, state: null });
    expect(SearchHitSchema.safeParse(hit).success).toBe(true);
  });
});

describe("other mappings", () => {
  it("renames a round's date to playedOn", () => {
    const round = toRound({ id: "22222222-2222-4222-8222-222222222222", playedAt: "2026-05-01" });
    expect(round).toEqual({ id: "22222222-2222-4222-8222-222222222222", playedOn: "2026-05-01" });
    expect(RoundSchema.safeParse(round).success).toBe(true);
  });

  it("maps ranking entries and member lists to valid contract shapes", () => {
    const entry = toRankingEntry({ course: course(), rank: 3, type: "state", scope: "MI" });
    expect(RankingEntrySchema.safeParse(entry).success).toBe(true);
    const list = toMemberList({
      member: { username: "friend", displayName: "Friend" },
      rows: [{ course: course(), rank: 1, onMyList: true }],
    });
    expect(list.courses[0]).toMatchObject({ rank: 1, onMyList: true });
    expect(MemberListSchema.safeParse(list).success).toBe(true);
  });
});
