import type { Course } from "../catalog/course";
import type { MemberListRow, PublicMember } from "../friends/types";

/**
 * Profile, timeline and feed shapes shared by the API services that produce
 * them and the web pages that render them (decision 2026-09-29, social
 * redesign). Like the friends shapes, nothing here carries an email address
 * or a user id.
 */

/** Whose profile the viewer is looking at. */
export enum ProfileRelationship {
  /** The viewer's own profile. */
  Self = "self",
  /** An accepted friend's profile. */
  Friends = "friends",
}

export interface ProfileStats {
  /** Courses on the member's list (every one has been played). */
  courses: number;
  rounds: number;
  /** Rounds dated in the current calendar year (UTC). */
  roundsThisYear: number;
  friends: number;
}

/** The course two members' rankings disagree on most. */
export interface ProfileSplit {
  course: Course;
  myRank: number;
  theirRank: number;
}

/** How a friend's ranking compares with the viewer's. */
export interface ProfileComparison {
  inCommon: number;
  /** Share of shared-course pairs both order the same way; null below three shared courses. */
  agreement: number | null;
  biggestSplit: ProfileSplit | null;
}

export interface Profile {
  member: PublicMember;
  relationship: ProfileRelationship;
  /** ISO date the friendship was accepted; null on the viewer's own profile. */
  friendsSince: string | null;
  stats: ProfileStats;
  /** The member's personal ranks 1-4. */
  topFour: MemberListRow[];
  /** Null on the viewer's own profile. */
  comparison: ProfileComparison | null;
}

/** One round on a member's timeline. */
export interface TimelineRound {
  id: string;
  course: Course;
  /** ISO date played; null when the member did not record a date. */
  playedOn: string | null;
  /** 1 for the member's first round at this course, 2 for the second, ... Undated rounds count as earliest. */
  visit: number;
  /** The member's current personal rank for this course. */
  rank: number;
}

/**
 * How many rounds a member logged in one month of their timeline, counted
 * over all their rounds, so a month split across pages shows its full total.
 */
export interface TimelineMonthCount {
  /** "YYYY-MM"; null for the member's rounds without a date. */
  month: string | null;
  rounds: number;
}

/** What a feed item reports. */
export enum FeedItemType {
  /** A friend logged a round. */
  Round = "round",
  /** A friend logged rounds long after playing them; collapsed into one item per day. */
  Backfill = "backfill",
}

export interface FeedItem {
  /** Stable across pages. */
  id: string;
  type: FeedItemType;
  /** When it happened (ISO timestamp): when the round was logged. */
  at: string;
  member: PublicMember;
  /** The round of a `round` item; up to four examples, one per course, of a `backfill` item. */
  rounds: TimelineRound[];
  /** Rounds the item stands for: 1 for a `round` item, all of them for a `backfill` item. */
  count: number;
}

/** A course on a member's Want to play list. */
export interface WantToPlayEntry {
  course: Course;
  /** When it was added (ISO timestamp). */
  addedAt: string;
}

/** A published list: its identity, display title, size and source. */
export interface TopListInfo {
  type: string;
  scope: string;
  title: string;
  size: number;
  /** Publisher, e.g. "GOLF Magazine". */
  source: string;
  sourceYear: number;
}

/** How many of a list's courses a member has played. */
export interface MemberProgress {
  member: PublicMember;
  played: number;
}

/** A list with the viewer's progress and each friend's who has played any of it, most first. */
export interface TopListStanding {
  list: TopListInfo;
  mine: number;
  friends: MemberProgress[];
}

/** One course of a list, for the viewer. */
export interface TopListCourse {
  course: Course;
  rank: number;
  /** The viewer's rounds there. */
  played: number;
  wantToPlay: boolean;
  /** Friends who played it, by display name. */
  friendsPlayed: PublicMember[];
}

/** A list as a checklist for the viewer and their friends. */
export interface TopListDetail {
  standing: TopListStanding;
  entries: TopListCourse[];
}
