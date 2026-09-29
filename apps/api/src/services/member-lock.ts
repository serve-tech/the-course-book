import { inArray, sql } from "drizzle-orm";
import type { Transaction } from "../db/client";
import { users } from "../db/schema";

/**
 * The member lock: one transaction-scoped advisory lock per member, keyed on
 * `hashtext(user_id)`. Every change to a member's list, their friendships and
 * the deletion of their account holds it, so those serialize, and whoever
 * gets it second sees the first's committed result (for example, that the
 * account was deleted).
 */

/** A locked member's row as read after the lock was granted. */
export interface LockedMember {
  id: string;
  username: string;
  displayName: string;
  deletedAt: Date | null;
}

/**
 * Take the member locks for `ids` inside `tx`, then read those members.
 *
 * Locks are taken in ascending key order, one key per distinct hash, so two
 * transactions locking overlapping members can never wait on each other in
 * a cycle, even when two ids hash alike. The rows are read after the locks
 * are granted, so they reflect any account deletion that committed while
 * this transaction waited.
 *
 * Args:
 *     tx: The transaction that holds the locks until it ends.
 *     ids: Member ids; duplicates are fine.
 *
 * Returns:
 *     The members that exist, in no particular order; callers decide what a
 *     missing or deleted member means.
 */
export async function lockMembers(tx: Transaction, ids: readonly string[]): Promise<LockedMember[]> {
  if (!ids.length) return [];
  const hashes = sql.join(
    ids.map((id) => sql`hashtext(${id})`),
    sql`, `,
  );
  const { rows } = await tx.execute<{ key: number }>(
    sql`select distinct key from unnest(array[${hashes}]) as key order by key`,
  );
  for (const { key } of rows) await tx.execute(sql`select pg_advisory_xact_lock(${key}::bigint)`);
  return tx
    .select({ id: users.id, username: users.username, displayName: users.displayName, deletedAt: users.deletedAt })
    .from(users)
    .where(inArray(users.id, [...ids]));
}
