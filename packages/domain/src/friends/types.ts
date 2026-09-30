import type { Course } from "../catalog/course";

/**
 * Member directory shapes shared by the server modules that produce them and
 * the Friends page. Nothing here carries an email address or a user id.
 */

/** Another member as the directory shows them. */
export interface PublicMember {
  username: string;
  displayName: string;
}

/**
 * The viewer's relationship to another member. Friendships are mutual and
 * start as a request (decision 2026-09-29, friends-only visibility).
 */
export enum Relationship {
  /** No friendship and no pending request. */
  None = "none",
  /** Mutual friends: each sees the other's list. */
  Friends = "friends",
  /** The viewer asked; waiting for the other member to accept. */
  Requested = "requested",
  /** The other member asked; the viewer can accept or decline. */
  Incoming = "incoming",
}

/** Another member together with the viewer's relationship to them. */
export interface MemberRelationship {
  member: PublicMember;
  relationship: Relationship;
}

/** The viewer's pending friend requests. */
export interface FriendRequests {
  /** Members who asked the viewer. */
  incoming: PublicMember[];
  /** Members the viewer asked. */
  outgoing: PublicMember[];
}

/** One course on another member's list, relative to the viewer. */
export interface MemberListRow {
  course: Course;
  rank: number;
  /** Whether the viewer already has this course (by id or equivalent identity). */
  onMyList: boolean;
  /** The member's rounds at this course. */
  played: number;
  /** ISO date of the member's latest dated round here; null when none is dated. */
  lastPlayedOn: string | null;
  /** The viewer's own rank for this course (by id or equivalent identity); null when not on their list. */
  myRank: number | null;
}

/** Another member's list as the viewer sees it. */
export interface MemberList {
  member: PublicMember;
  rows: MemberListRow[];
}
