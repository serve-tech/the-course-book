import { MemberRole } from "@coursebook/domain/curation/types";
import { and, isNull, sql } from "drizzle-orm";
import type { Database } from "../../src/db/client";
import { users } from "../../src/db/schema";

/** What a role change did. */
export interface RoleChange {
  username: string;
  from: MemberRole;
  to: MemberRole;
}

/**
 * Give an active member a role, admin included. This is the only way to
 * make an admin (decision 2026-11-13); the API never does.
 *
 * Args:
 *     db: The database to change.
 *     username: The member, matched case-insensitively.
 *     role: The role to give.
 *
 * Returns:
 *     The change, or null when no active member has that username.
 */
export async function assignRole(db: Database, username: string, role: MemberRole): Promise<RoleChange | null> {
  return db.transaction(async (tx) => {
    const [member] = await tx
      .select({ id: users.id, username: users.username, role: users.role })
      .from(users)
      .where(and(sql`lower(${users.username}) = lower(${username})`, isNull(users.deletedAt)))
      .for("update");
    if (!member) return null;
    await tx.update(users).set({ role, updatedAt: sql`now()` }).where(sql`${users.id} = ${member.id}`);
    return { username: member.username, from: member.role, to: role };
  });
}

/** The role named on the command line, or null when it is not one. */
export function parseRole(value: string | undefined): MemberRole | null {
  return Object.values(MemberRole).find((role) => role === value?.trim().toLowerCase()) ?? null;
}
