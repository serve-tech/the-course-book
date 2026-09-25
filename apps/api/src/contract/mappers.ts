import type { Course, RankedCourse } from "@coursebook/domain/catalog/course";
import type { SearchResult } from "@coursebook/domain/catalog/search-results";
import type { MemberList } from "@coursebook/domain/friends/types";
import type { ListEntry, RoundEntry } from "@coursebook/domain/journal/types";
import { z } from "zod";
import { UNKNOWN_LOCATION } from "../domain/course-view";
import type {
  ContractCourse,
  CourseDetails,
  CourseRanks,
} from "./schemas";

/**
 * Pure translations from domain shapes to the public contract.
 *
 * The domain `Course` still carries fields shaped for the legacy web UI
 * (empty strings, a placeholder location, a Michigan rank). The contract
 * uses null for absent values and a `ranks` object, so these mappers are the
 * only place that knows both shapes.
 */

const uuid = z.uuid();
const orNull = (value: string): string | null => (value.trim() ? value : null);

export function toCourseRanks(course: Course): CourseRanks {
  return {
    world: course.world,
    usa: course.usa,
    usaPublic: course.public,
    state: course.stateRank,
  };
}

export function toCourseDetails(course: Course): CourseDetails {
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

/** A catalog course; its id is the catalog row uuid. */
export function toContractCourse(course: Course): ContractCourse {
  return { id: course.id, ...toCourseDetails(course), ranks: toCourseRanks(course) };
}

export function toMyCourse(entry: ListEntry) {
  return { course: toContractCourse(entry.course), rank: entry.rank, played: entry.played };
}

export function toRound(round: RoundEntry) {
  return { id: round.id, playedOn: round.playedAt };
}

export function toRankingEntry(entry: RankedCourse) {
  return {
    course: toContractCourse(entry.course),
    rank: entry.rank,
    type: entry.type,
    scope: entry.scope,
  };
}

/**
 * A search hit. Hits already in the catalog carry its uuid; other hits carry
 * only their details, which a client sends back to add the course.
 */
export function toSearchHit(result: SearchResult) {
  const catalogId = uuid.safeParse(result.course.id);
  return {
    courseId: catalogId.success ? catalogId.data : null,
    course: toCourseDetails(result.course),
    ranks: toCourseRanks(result.course),
  };
}

export function toMemberList(list: MemberList) {
  return {
    member: list.member,
    courses: list.rows.map((row) => ({
      course: toContractCourse(row.course),
      rank: row.rank,
      onMyList: row.onMyList,
    })),
  };
}
