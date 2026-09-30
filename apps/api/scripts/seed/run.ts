/**
 * Write a development seed plan (plan.ts) to the local database, replacing
 * the previous seed.
 *
 * Seeded members are the `users` rows whose id starts with `seed_`; deleting
 * them cascades to their lists, rounds and friendships, including yours with
 * them. Nothing else is touched except, when the plan includes it, your own
 * list and rounds. Everything happens in one transaction under your journal
 * lock, so a failure leaves the previous state and a running app never sees
 * half a seed.
 */
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "../../src/db/client";
import { friendships, rounds, userCourses, users } from "../../src/db/schema";
import { withJournalLock } from "../../src/services/journal";
import { SEED_ID_PREFIX, type SeedJournal, type SeedPlan } from "./plan";

/** What the seed does with your own list and rounds. */
export enum YourData {
  /** Seed your list only if it is empty; stop without writing otherwise. */
  FillIfEmpty = "fill_if_empty",
  /** Replace your list and rounds with seeded ones. */
  Replace = "replace",
  /** Leave your list and rounds alone. */
  Keep = "keep",
}

/** A member of the local database. */
export interface LocalMember {
  id: string;
  username: string;
}

const isSeeded = sql`starts_with(${users.id}, ${SEED_ID_PREFIX})`;

/**
 * Find an active member who is not seeded by username or email, ignoring case.
 *
 * Returns:
 *     The member, or null when nobody matches (for example, you have not yet
 *     signed in to the local app, which is what creates your row).
 */
export async function findMember(db: Database, reference: string): Promise<LocalMember | null> {
  const value = reference.trim().toLowerCase();
  const [row] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(
      and(
        isNull(users.deletedAt),
        sql`not ${isSeeded}`,
        or(sql`lower(${users.username}) = ${value}`, sql`lower(${users.email}) = ${value}`),
      ),
    );
  return row ?? null;
}

/**
 * Replace the previous seed with `plan`.
 *
 * Args:
 *     db: The local database.
 *     plan: From `planSeed`, built for `youId`.
 *     youId: Your `users.id`; the row must exist.
 *     yours: What to do with your own list when the plan includes it.
 *
 * Raises:
 *     Error: Nothing is written when your list is not empty and `yours` is
 *         `FillIfEmpty`, or a seeded username belongs to another member.
 */
export async function writeSeed(db: Database, plan: SeedPlan, youId: string, yours: YourData): Promise<void> {
  await withJournalLock(db, youId, async (tx) => {
    const yourJournal = plan.journals.find((journal) => journal.userId === youId);
    if (yourJournal && yours === YourData.FillIfEmpty) {
      const existing = await tx.$count(userCourses, eq(userCourses.userId, youId));
      if (existing > 0)
        throw new Error(
          `You already have ${String(existing)} ${existing === 1 ? "course" : "courses"} on your list. Rerun with --replace-mine to replace them with seeded ones, or --keep-mine to seed only the other members.`,
        );
    }
    const usernames = plan.members.map((member) => member.username.toLowerCase());
    if (usernames.length) {
      const taken = await tx
        .select({ username: users.username })
        .from(users)
        .where(and(sql`not ${isSeeded}`, inArray(sql`lower(${users.username})`, usernames)));
      if (taken.length)
        throw new Error(`Seeded usernames already belong to local members: ${taken.map((row) => row.username).join(", ")}. Rename them in scripts/seed/personas.ts.`);
    }

    await tx.delete(users).where(isSeeded);
    // Deleting the memberships deletes their rounds (rounds_membership_fk cascades).
    if (yourJournal) await tx.delete(userCourses).where(eq(userCourses.userId, youId));

    if (plan.members.length)
      await tx.insert(users).values(
        plan.members.map((member) => ({
          id: member.id,
          username: member.username,
          displayName: member.displayName,
          createdAt: member.createdAt,
          updatedAt: member.createdAt,
        })),
      );
    for (const journal of plan.journals) {
      if (!journal.courseIds.length) continue;
      const added = firstLogged(journal);
      await tx.insert(userCourses).values(
        journal.courseIds.map((courseId, index) => {
          const at = added.get(courseId);
          if (!at) throw new Error(`Seeded course ${courseId} on ${journal.userId}'s list has no rounds`);
          return { userId: journal.userId, courseId, personalRank: index + 1, createdAt: at, updatedAt: at };
        }),
      );
      await tx.insert(rounds).values(
        journal.rounds.map((round) => ({
          userId: journal.userId,
          courseId: round.courseId,
          playedAt: round.playedOn,
          createdAt: round.createdAt,
        })),
      );
    }
    if (plan.friendships.length) await tx.insert(friendships).values([...plan.friendships]);
  });
}

/** When each course joined the list: its first logged round. */
function firstLogged(journal: SeedJournal): Map<string, Date> {
  const first = new Map<string, Date>();
  for (const round of journal.rounds) {
    const seen = first.get(round.courseId);
    if (!seen || round.createdAt < seen) first.set(round.courseId, round.createdAt);
  }
  return first;
}
