import { describe, expect, it } from "vitest";
import type { ApiSchemas } from "./client";
import {
  fromApiCourse,
  fromMemberList,
  fromMyCourse,
  fromRound,
  fromSearchHit,
  toCourseDetailsRequest,
  UNKNOWN_LOCATION,
} from "./mappers";

const ranks = (state: number | null = null): ApiSchemas["CourseRanks"] => ({ world: 60, usa: 40, usaPublic: 12, state });

const arcadia: ApiSchemas["Course"] = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Arcadia Bluffs",
  location: "Arcadia, MI, USA",
  city: "Arcadia",
  state: "MI",
  country: "USA",
  logoUrl: null,
  websiteUrl: "https://arcadiabluffs.com",
  ranks: ranks(3),
};

describe("API course to domain course", () => {
  it("restores the domain conventions, including the Michigan rank", () => {
    expect(fromApiCourse(arcadia)).toMatchObject({
      id: arcadia.id,
      location: "Arcadia, MI, USA",
      region: "michigan",
      world: 60,
      usa: 40,
      public: 12,
      michigan: 3,
      stateRank: 3,
      logo: "",
      website: "https://arcadiabluffs.com",
    });
  });

  it("gives other states' ranks only as stateRank", () => {
    expect(fromApiCourse({ ...arcadia, state: "TX", ranks: ranks(9) })).toMatchObject({ region: "usa", michigan: null, stateRank: 9 });
  });

  it("uses the placeholder for an unknown location and empty strings for absent fields", () => {
    expect(fromApiCourse({ ...arcadia, location: null, city: null, state: null, country: "Scotland" })).toMatchObject({
      location: UNKNOWN_LOCATION,
      city: "",
      state: "",
      region: "international",
    });
  });
});

describe("other API shapes", () => {
  it("maps list entries, rounds and member lists", () => {
    expect(fromMyCourse({ course: arcadia, rank: 2, played: 5 })).toMatchObject({ rank: 2, played: 5, course: { id: arcadia.id } });
    expect(fromRound({ id: "r", playedOn: "2026-05-01" })).toEqual({ id: "r", playedAt: "2026-05-01" });
    expect(fromMemberList({ member: { username: "a", displayName: "A" }, courses: [{ course: arcadia, rank: 1, onMyList: true }] }).rows).toMatchObject([
      { rank: 1, onMyList: true, course: { name: "Arcadia Bluffs" } },
    ]);
  });

  it("keeps a catalog hit's id and gives other hits a non-uuid id", () => {
    const details = { name: "Arcadia South", location: "Arcadia, MI, USA", city: "Arcadia", state: "MI", country: "USA", logoUrl: null, websiteUrl: null };
    expect(fromSearchHit({ courseId: arcadia.id, course: details, ranks: ranks() }, 0).course.id).toBe(arcadia.id);
    expect(fromSearchHit({ courseId: null, course: details, ranks: ranks() }, 4).course.id).toBe("search:4");
  });

  it("round-trips course details for an add-course request", () => {
    const course = fromApiCourse({ ...arcadia, location: null, logoUrl: null });
    expect(toCourseDetailsRequest(course)).toEqual({
      name: "Arcadia Bluffs",
      location: null,
      city: "Arcadia",
      state: "MI",
      country: "USA",
      logoUrl: null,
      websiteUrl: "https://arcadiabluffs.com",
    });
  });
});
