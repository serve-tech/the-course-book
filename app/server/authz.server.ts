import type { AppUser } from "./provisioning.server";
import type { PublicMember } from "../features/friends/types";

/**
 * Authorization rules, stated in one place so they can be read and tested.
 *
 * - Anonymous visitors may read the index (empty personal data) and the
 *   published rankings.
 * - Any signed-in member may read any member's list and the directory.
 * - A member's journal is written only by that member; the acting user is
 *   always taken from the request context, never from form input.
 * - Nothing about another member is exposed beyond username and display name.
 */

export enum Access {
  Anonymous = "anonymous",
  Member = "member",
}

/** Public projection of a member; never includes email or the Clerk id. */

export function canViewMemberLists(viewer: AppUser | null): boolean {
  return viewer !== null;
}

export function canSearchCourses(viewer: AppUser | null): boolean {
  return viewer !== null;
}

export function ownsJournal(viewer: AppUser | null, userId: string): boolean {
  return viewer !== null && viewer.id === userId;
}

export function toPublicMember(user: {
  username: string;
  displayName: string;
}): PublicMember {
  return { username: user.username, displayName: user.displayName };
}
