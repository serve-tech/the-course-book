import { courseSchema } from "@coursebook/domain/catalog/course";
import { FeedItemType, ProfileRelationship } from "@coursebook/domain/social/types";
import { describe, expect, it } from "vitest";
import { UNKNOWN_LOCATION } from "../domain/course-view";
import {
  toContractCourse,
  toCourseDetails,
  toFeedItem,
  toMemberList,
  toProfile,
  toRankingEntry,
  toRound,
  toSearchHit,
  toTimelineRound,
} from "./mappers";
import {
  CourseSchema,
  FeedItemSchema,
  MemberListSchema,
  ProfileSchema,
  RankingEntrySchema,
  RoundSchema,
  SearchHitSchema,
  TimelineRoundSchema,
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
    global: 70,
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
      ranks: { world: 60, usa: 40, usaPublic: 12, state: 3, global: 70 },
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
    const hit = toSearchHit({ course: course(), display: course(), catalogId: CATALOG_ID });
    expect(hit.courseId).toBe(CATALOG_ID);
    expect(SearchHitSchema.safeParse(hit).success).toBe(true);
  });

  // OpenGolfAPI ids are uuids too: the id's shape must not decide membership.
  it.each(["api-123", "b25a4e85-561a-4ca4-8028-7c3480c9bbc0"])("carries no id for a course outside the catalog (id %s)", (id) => {
    const external = course({ id, world: null, global: null, usa: null, public: null, michigan: null, stateRank: null });
    const hit = toSearchHit({ course: external, display: external, catalogId: null });
    expect(hit.courseId).toBeNull();
    expect(hit.ranks).toEqual({ world: null, usa: null, usaPublic: null, state: null, global: null });
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
      rows: [{ course: course(), rank: 1, onMyList: true, played: 3, lastPlayedOn: "2026-09-27", myRank: 2 }],
    });
    expect(list.courses[0]).toMatchObject({ rank: 1, onMyList: true, played: 3, lastPlayedOn: "2026-09-27", myRank: 2 });
    expect(MemberListSchema.safeParse(list).success).toBe(true);
  });

  it("maps profiles, timeline rounds and feed items to valid contract shapes", () => {
    const row = { course: course(), rank: 1, onMyList: false, played: 1, lastPlayedOn: null, myRank: null };
    const round = { id: "aaaaaaaa-0000-4000-8000-000000000009", course: course(), playedOn: null, visit: 1, rank: 1 };
    const profile = toProfile({
      member: { username: "friend", displayName: "Friend" },
      relationship: ProfileRelationship.Friends,
      friendsSince: "2025-06-01",
      stats: { courses: 1, rounds: 1, roundsThisYear: 0, friends: 3 },
      topFour: [row],
      comparison: { inCommon: 1, agreement: null, biggestSplit: { course: course(), myRank: 9, theirRank: 1 } },
    });
    expect(ProfileSchema.safeParse(profile).success).toBe(true);
    expect(profile.comparison.biggestSplits).toHaveLength(1);
    expect(TimelineRoundSchema.safeParse(toTimelineRound(round)).success).toBe(true);
    const item = toFeedItem({
      id: "backfill:" + round.id,
      type: FeedItemType.Backfill,
      at: "2026-09-29T18:04:05.123456Z",
      member: { username: "friend", displayName: "Friend" },
      rounds: [round],
      count: 12,
    });
    expect(FeedItemSchema.safeParse(item).success).toBe(true);
  });
});
