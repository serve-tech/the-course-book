import { courseSchema, type Course, type RankedCourse } from "@coursebook/domain/catalog/course";
import type { SearchResult } from "@coursebook/domain/catalog/search-results";
import type { MemberList, MemberListRow } from "@coursebook/domain/friends/types";
import { FeedItemType, ProfileRelationship, type FeedItem, type Profile, type TimelineRound } from "@coursebook/domain/social/types";
import type { ListEntry, RoundEntry } from "@coursebook/domain/journal/types";
import type { ApiSchemas } from "./client";

/**
 * Pure translations from API contract shapes to the web app's domain model.
 *
 * The components were written against the domain `Course` (empty strings for
 * absent values, a display location with a placeholder, a Michigan rank and
 * a region). The contract is cleaner, so these mappers restore those
 * conventions in one tested place instead of touching every component.
 */

/** Shown when a course has no location; matches the API's former placeholder. */
export const UNKNOWN_LOCATION = "Location not specified";

type Details = ApiSchemas["CourseDetails"];
type Ranks = ApiSchemas["CourseRanks"];

function region(country: string, state: string | null): string {
  if (country.toUpperCase() !== "USA") return "international";
  return state?.toUpperCase() === "MI" ? "michigan" : "usa";
}

function toCourse(id: string, details: Details, ranks: Ranks): Course {
  return courseSchema.parse({
    id,
    name: details.name,
    location: details.location ?? UNKNOWN_LOCATION,
    city: details.city ?? "",
    state: details.state ?? "",
    country: details.country,
    region: region(details.country, details.state),
    world: ranks.world,
    usa: ranks.usa,
    public: ranks.usaPublic,
    michigan: details.state?.toUpperCase() === "MI" ? ranks.state : null,
    stateRank: ranks.state,
    logo: details.logoUrl ?? "",
    website: details.websiteUrl ?? "",
  });
}

export function fromApiCourse(course: ApiSchemas["Course"]): Course {
  return toCourse(course.id, course, course.ranks);
}

export function fromMyCourse(entry: ApiSchemas["MyCourse"]): ListEntry {
  return { course: fromApiCourse(entry.course), rank: entry.rank, played: entry.played };
}

export function fromRankingEntry(entry: ApiSchemas["RankingEntry"]): RankedCourse {
  return { course: fromApiCourse(entry.course), rank: entry.rank, type: entry.type, scope: entry.scope };
}

export function fromRound(round: ApiSchemas["Round"]): RoundEntry {
  return { id: round.id, playedAt: round.playedOn };
}

/**
 * A search hit as the Log Round dialog's `SearchResult`. `catalogId` is the
 * API's `courseId`: set for catalog courses, which the dialog logs by id, and
 * null for other hits, which it logs by details. Hits outside the catalog get
 * a synthetic id (`search:<index>`) only so the list has a stable key.
 */
export function fromSearchHit(hit: ApiSchemas["SearchHit"], index: number): SearchResult {
  const course = toCourse(hit.courseId ?? "search:" + String(index), hit.course, hit.ranks);
  return { course, display: course, catalogId: hit.courseId };
}

export function fromMemberCourse(row: ApiSchemas["MemberCourse"]): MemberListRow {
  return {
    course: fromApiCourse(row.course),
    rank: row.rank,
    onMyList: row.onMyList,
    played: row.played,
    lastPlayedOn: row.lastPlayedOn,
    myRank: row.myRank,
  };
}

export function fromMemberList(list: ApiSchemas["MemberList"]): MemberList {
  return { member: list.member, rows: list.courses.map(fromMemberCourse) };
}

export function fromTimelineRound(round: ApiSchemas["TimelineRound"]): TimelineRound {
  return { id: round.id, course: fromApiCourse(round.course), playedOn: round.playedOn, visit: round.visit, rank: round.rank };
}

/** Relationship values this client knows; anything newer reads as a friend's profile. */
function toProfileRelationship(value: string): ProfileRelationship {
  return (Object.values(ProfileRelationship) as string[]).includes(value) ? (value as ProfileRelationship) : ProfileRelationship.Friends;
}

/**
 * A profile. The API always sends a comparison object; this client models
 * "no comparison" (the viewer's own profile) as null.
 */
export function fromProfile(profile: ApiSchemas["Profile"]): Profile {
  const relationship = toProfileRelationship(profile.relationship);
  const { inCommon, agreement, biggestSplits } = profile.comparison;
  const split = biggestSplits[0];
  return {
    member: profile.member,
    relationship,
    friendsSince: profile.friendsSince,
    stats: profile.stats,
    topFour: profile.topFour.map(fromMemberCourse),
    comparison:
      relationship === ProfileRelationship.Self || inCommon === null
        ? null
        : {
            inCommon,
            agreement,
            biggestSplit: split ? { course: fromApiCourse(split.course), myRank: split.myRank, theirRank: split.theirRank } : null,
          },
  };
}

const FEED_ITEM_TYPES: ReadonlySet<string> = new Set(Object.values(FeedItemType));

/** A feed item, or null for a type this client does not know yet (the contract lets types grow). */
export function fromFeedItem(item: ApiSchemas["FeedItem"]): FeedItem | null {
  if (!FEED_ITEM_TYPES.has(item.type)) return null;
  return {
    id: item.id,
    type: item.type as FeedItemType,
    at: item.at,
    member: item.member,
    rounds: item.rounds.map(fromTimelineRound),
    count: item.count,
  };
}

/** A domain course's details as the API's add-course request expects them. */
export function toCourseDetailsRequest(course: Pick<Course, "name" | "location" | "city" | "state" | "country" | "logo" | "website">): ApiSchemas["CourseDetailsRequest"] {
  const orNull = (value: string) => (value.trim() ? value : null);
  return {
    name: course.name,
    location: course.location === UNKNOWN_LOCATION ? null : orNull(course.location),
    city: orNull(course.city),
    state: orNull(course.state),
    country: course.country,
    logoUrl: orNull(course.logo),
    websiteUrl: orNull(course.website),
  };
}
