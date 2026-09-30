import { FeedItemType, ProfileRelationship } from "@coursebook/domain/social/types";
import { describe, expect, it } from "vitest";
import type { ApiSchemas } from "./client";
import {
  fromApiCourse,
  fromFeedItem,
  fromMemberList,
  fromProfile,
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
    const row = { course: arcadia, rank: 1, onMyList: true, played: 2, lastPlayedOn: "2026-09-01", myRank: 4 };
    expect(fromMemberList({ member: { username: "a", displayName: "A" }, courses: [row] }).rows).toMatchObject([
      { rank: 1, onMyList: true, played: 2, lastPlayedOn: "2026-09-01", myRank: 4, course: { name: "Arcadia Bluffs" } },
    ]);
  });

  it("models the viewer's own profile as having no comparison", () => {
    const profile = (relationship: string, inCommon: number | null): ApiSchemas["Profile"] => ({
      member: { username: "a", displayName: "A" },
      relationship,
      friendsSince: null,
      stats: { courses: 1, rounds: 1, roundsThisYear: 0, friends: 0 },
      topFour: [],
      comparison: { inCommon, agreement: null, biggestSplits: [{ course: arcadia, myRank: 9, theirRank: 1 }] },
    });
    expect(fromProfile(profile("self", null))).toMatchObject({ relationship: ProfileRelationship.Self, comparison: null });
    expect(fromProfile(profile("friends", 3)).comparison).toMatchObject({ inCommon: 3, biggestSplit: { myRank: 9, theirRank: 1 } });
    // A relationship this client does not know yet reads as a friend.
    expect(fromProfile(profile("besties", 3)).relationship).toBe(ProfileRelationship.Friends);
  });

  it("drops feed items of types this client does not know", () => {
    const round = { id: "r1", course: arcadia, playedOn: null, visit: 1, rank: 2 };
    const item = (type: string): ApiSchemas["FeedItem"] => ({
      id: type + ":1",
      type,
      at: "2026-09-29T18:04:05.123456Z",
      member: { username: "a", displayName: "A" },
      rounds: [round],
      count: 1,
    });
    expect(fromFeedItem(item("round"))).toMatchObject({ type: FeedItemType.Round, rounds: [{ id: "r1", playedOn: null, rank: 2 }] });
    expect(fromFeedItem(item("rating"))).toBeNull();
  });

  it("keeps a catalog hit's id as its catalogId and marks other hits as outside the catalog", () => {
    const details = { name: "Arcadia South", location: "Arcadia, MI, USA", city: "Arcadia", state: "MI", country: "USA", logoUrl: null, websiteUrl: null };
    const known = fromSearchHit({ courseId: arcadia.id, course: details, ranks: ranks() }, 0);
    expect([known.course.id, known.catalogId]).toEqual([arcadia.id, arcadia.id]);
    const other = fromSearchHit({ courseId: null, course: details, ranks: ranks() }, 4);
    expect([other.course.id, other.catalogId]).toEqual(["search:4", null]);
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
