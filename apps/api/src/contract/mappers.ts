import type { Course, RankedCourse } from "@coursebook/domain/catalog/course";
import type { SearchResult } from "@coursebook/domain/catalog/search-results";
import type { MemberList, MemberListRow } from "@coursebook/domain/friends/types";
import type { FeedItem, Profile, TimelineRound, WantToPlayEntry } from "@coursebook/domain/social/types";
import type { ListEntry, RoundEntry } from "@coursebook/domain/journal/types";
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

const orNull = (value: string): string | null => (value.trim() ? value : null);

export function toCourseRanks(course: Course): CourseRanks {
  return {
    world: course.world,
    usa: course.usa,
    usaPublic: course.public,
    state: course.stateRank,
    global: course.global,
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
 * A search hit. Hits already in the catalog carry its id; other hits carry
 * only their details, which a client sends back to add the course. Catalog
 * membership comes from the search (`catalogId`), not from the id's shape.
 */
export function toSearchHit(result: SearchResult) {
  return {
    courseId: result.catalogId,
    course: toCourseDetails(result.course),
    ranks: toCourseRanks(result.course),
  };
}

/** A row of another member's ranking, relative to the viewer. */
export function toMemberCourse(row: MemberListRow) {
  return {
    course: toContractCourse(row.course),
    rank: row.rank,
    onMyList: row.onMyList,
    played: row.played,
    lastPlayedOn: row.lastPlayedOn,
    myRank: row.myRank,
  };
}

export function toMemberList(list: MemberList) {
  return { member: list.member, courses: list.rows.map(toMemberCourse) };
}

export function toTimelineRound(round: TimelineRound) {
  return {
    id: round.id,
    course: toContractCourse(round.course),
    playedOn: round.playedOn,
    visit: round.visit,
    rank: round.rank,
  };
}

export function toProfile(profile: Profile) {
  const comparison = profile.comparison;
  const split = comparison?.biggestSplit ?? null;
  return {
    member: profile.member,
    relationship: profile.relationship,
    friendsSince: profile.friendsSince,
    stats: profile.stats,
    topFour: profile.topFour.map(toMemberCourse),
    comparison: {
      inCommon: comparison?.inCommon ?? null,
      agreement: comparison?.agreement ?? null,
      biggestSplits: split ? [{ course: toContractCourse(split.course), myRank: split.myRank, theirRank: split.theirRank }] : [],
    },
  };
}

export function toFeedItem(item: FeedItem) {
  return {
    id: item.id,
    type: item.type,
    at: item.at,
    member: item.member,
    rounds: item.rounds.map(toTimelineRound),
    count: item.count,
  };
}

export function toWantToPlay(entries: readonly WantToPlayEntry[]) {
  return { courses: entries.map((entry) => ({ course: toContractCourse(entry.course), addedAt: entry.addedAt })) };
}
