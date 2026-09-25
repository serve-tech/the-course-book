import { courseSchema, type Course, type RankedCourse } from "@coursebook/domain/catalog/course";
import type { SearchResult } from "@coursebook/domain/catalog/search-results";
import type { MemberList } from "@coursebook/domain/friends/types";
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
 * A search hit as the Log Round dialog's `SearchResult`. Hits outside the
 * catalog get a synthetic, non-uuid id (`search:<index>`), which the dialog
 * already treats as "send the details" rather than "send the id".
 */
export function fromSearchHit(hit: ApiSchemas["SearchHit"], index: number): SearchResult {
  const course = toCourse(hit.courseId ?? "search:" + String(index), hit.course, hit.ranks);
  return { course, display: course };
}

export function fromMemberList(list: ApiSchemas["MemberList"]): MemberList {
  return {
    member: list.member,
    rows: list.courses.map((row) => ({ course: fromApiCourse(row.course), rank: row.rank, onMyList: row.onMyList })),
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
