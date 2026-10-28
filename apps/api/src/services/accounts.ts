import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { courses, userCourses, users, wantToPlay } from "../db/schema";
import { removeAllFriendships } from "./friends";
import { withJournalLock } from "./journal";

/**
 * Delete a member's account data (App Store 5.1.1(v), Google Play account
 * deletion).
 *
 * In one transaction under the member's journal lock:
 * - memberships are deleted and their rounds cascade;
 * - Want to play entries are deleted;
 * - friendships and pending friend requests, in both directions, are deleted;
 * - courses the member created stay in the shared catalog with `created_by`
 *   cleared;
 * - the `users` row becomes a tombstone: username `deleted_<random>`,
 *   display name "Deleted member", email, avatar and legacy id cleared,
 *   `deleted_at` set.
 *
 * The tombstone, rather than removing the row, stops a session token that
 * outlives the deletion (up to a minute) from provisioning a fresh row from
 * its claims: provisioning never refreshes a deleted row. A member who has
 * no row yet (never provisioned, for example because their Clerk username
 * breaks the product rule) gets a tombstone too, for the same reason. The
 * Clerk account is deleted separately, after this commits (see the
 * DELETE /v1/me route).
 *
 * Args:
 *     db: Database handle.
 *     userId: The member's Clerk id (`users.id`), taken from the verified
 *         session; the member does not need to be provisioned.
 *
 * Raises:
 *     AppError: 401 `account_deleted` when the account was already deleted;
 *         the existing tombstone is left as it is.
 */
export async function deleteAccountData(db: Database, userId: string): Promise<void> {
  await withJournalLock(db, userId, async (tx) => {
    await tx.delete(userCourses).where(eq(userCourses.userId, userId));
    await tx.delete(wantToPlay).where(eq(wantToPlay.userId, userId));
    await removeAllFriendships(tx, userId);
    await tx.update(courses).set({ createdBy: null }).where(eq(courses.createdBy, userId));
    const tombstone = {
      username: "deleted_" + randomBytes(8).toString("hex"),
      displayName: "Deleted member",
      email: null,
      avatarUrl: null,
      legacySupabaseId: null,
      deletedAt: sql`now()`,
    };
    await tx
      .insert(users)
      .values({ id: userId, ...tombstone })
      .onConflictDoUpdate({ target: users.id, set: { ...tombstone, updatedAt: sql`now()` } });
  });
}
