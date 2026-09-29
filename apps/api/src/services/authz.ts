import type { PublicMember } from "@coursebook/domain/friends/types";

/**
 * Authorization rules, stated in one place. Routes enforce them with
 * `getAppUser`/`requireUser`; the one reusable piece is the public projection.
 *
 * - Anonymous visitors may read the index (empty personal data) and the
 *   published rankings.
 * - A signed-in member reads their own list and their accepted friends'
 *   lists; the member directory lists only friends, and anyone else is
 *   "not found". Member search reveals usernames and display names only.
 * - A member's journal is written only by that member; the acting user is
 *   always taken from the request context, never from form input.
 * - Nothing about another member is exposed beyond username and display name.
 */

/** Public projection of a member; never includes email or the Clerk id. */
export function toPublicMember(user: {
  username: string;
  displayName: string;
}): PublicMember {
  return { username: user.username, displayName: user.displayName };
}
