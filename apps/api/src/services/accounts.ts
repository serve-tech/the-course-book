import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { courses, userCourses, users } from "../db/schema";
import { withJournalLock } from "./journal";

/**
 * Delete a member's account data (App Store 5.1.1(v), Google Play account
 * deletion).
 *
 * In one transaction under the member's journal lock:
 * - memberships are deleted and their rounds cascade;
 * - courses the member created stay in the shared catalog with `created_by`
 *   cleared;
 * - the `users` row becomes a tombstone: username `deleted_<random>`,
 *   display name "Deleted member", email, avatar and legacy id cleared,
 *   `deleted_at` set.
 *
 * The tombstone, rather than removing the row, stops a session token that
 * outlives the deletion (up to a minute) from provisioning a fresh row from
 * its claims: provisioning never refreshes a deleted row. The Clerk account
 * is deleted separately, after this commits (see the DELETE /v1/me route).
 *
 * Raises:
 *     AppError: 401 `account_deleted` when the account was already deleted.
 */
export async function deleteAccountData(db: Database, userId: string): Promise<void> {
  await withJournalLock(db, userId, async (tx) => {
    await tx.delete(userCourses).where(eq(userCourses.userId, userId));
    await tx.update(courses).set({ createdBy: null }).where(eq(courses.createdBy, userId));
    await tx
      .update(users)
      .set({
        username: "deleted_" + randomBytes(8).toString("hex"),
        displayName: "Deleted member",
        email: null,
        avatarUrl: null,
        legacySupabaseId: null,
        deletedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(users.id, userId));
  });
}
