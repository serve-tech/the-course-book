import type { Course } from "../catalog/course";
import type { PublicMember } from "../friends/types";

/**
 * Who may curate course photos (decision 2026-11-13). Every member starts as
 * a member; an admin makes members curators. Admins are set by a command,
 * never through the API, so no request can create one.
 */
export enum MemberRole {
  Member = "member",
  /** Sets and removes course photos. */
  Curator = "curator",
  /** A curator who also grants and removes the curator role. */
  Admin = "admin",
}

/** Whether a role may set and remove course photos. */
export function canCurate(role: MemberRole): boolean {
  return role === MemberRole.Curator || role === MemberRole.Admin;
}

/** A course a curator might give a photo, with how many members rank it. */
export interface CurationCourse {
  course: Course;
  /** Members with the course on their ranking. */
  members: number;
}

/** A free-licensed Wikimedia Commons photo a curator can pick for a course. */
export interface CommonsCandidate {
  /** The file's page title, e.g. "File:ArcadiaBluffs1011.jpg"; what the curator picks. */
  file: string;
  /** A small preview for the results grid. */
  thumbUrl: string;
  width: number;
  height: number;
  credit: string;
  license: string;
  licenseUrl: string | null;
  sourceUrl: string;
  /** The file's description, as plain text, to tell similar photos apart. */
  description: string;
}

/** A member and their role, for the admin's Curators list. */
export interface RoledMember {
  member: PublicMember;
  role: MemberRole;
}
