import { and, eq, sql } from "drizzle-orm";
import { compareRankings } from "@coursebook/domain/social/compare";
import { ProfileRelationship, type Profile, type ProfileComparison, type ProfileStats } from "@coursebook/domain/social/types";
import type { MemberListRow } from "@coursebook/domain/friends/types";
import type { Database, Executor } from "../db/client";
import { friendships } from "../db/schema";
import { FriendshipStatus } from "../domain/friendship";
import { toPublicMember } from "./authz";
import { memberRanking, relativeRows, visibleMember } from "./friends";
import { personalList } from "./journal";

/**
 * Member profiles (decision 2026-09-29, social redesign): the header,
 * stats, Top Four and, on a friend's profile, how their ranking compares
 * with the viewer's. A profile is visible to the member and their accepted
 * friends only; anyone else is "not found".
 */

/** How many top-ranked courses a profile features. */
export const TOP_FOUR = 4;

interface StatsRow extends Record<string, unknown> {
  courses: string;
  rounds: string;
  rounds_this_year: string;
  friends: string;
}

/** Counts for a profile header; the year is the database's current (UTC) year. */
export async function profileStats(db: Executor, userId: string): Promise<ProfileStats> {
  const { rows } = await db.execute<StatsRow>(sql`
    select
      (select count(*) from user_courses where user_id = ${userId})::text as courses,
      (select count(*) from rounds where user_id = ${userId})::text as rounds,
      (select count(*) from rounds where user_id = ${userId}
        and played_at >= date_trunc('year', current_date)::date)::text as rounds_this_year,
      (select count(*) from friendships f
        join users u on u.id = case when f.requester_id = ${userId} then f.addressee_id else f.requester_id end
        where f.status = ${FriendshipStatus.Accepted}
          and (f.requester_id = ${userId} or f.addressee_id = ${userId})
          and u.deleted_at is null)::text as friends
  `);
  const row = rows[0];
  if (!row) throw new Error("Profile stats query returned no row");
  return {
    courses: Number(row.courses),
    rounds: Number(row.rounds),
    roundsThisYear: Number(row.rounds_this_year),
    friends: Number(row.friends),
  };
}

/** ISO date the two members' friendship was accepted, or null without one. */
async function friendsSince(db: Executor, a: string, b: string): Promise<string | null> {
  const [row] = await db
    .select({ since: sql<string>`(${friendships.updatedAt} at time zone 'UTC')::date::text` })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, FriendshipStatus.Accepted),
        sql`least(${friendships.requesterId}, ${friendships.addresseeId}) = least(${a}, ${b})`,
        sql`greatest(${friendships.requesterId}, ${friendships.addresseeId}) = greatest(${a}, ${b})`,
      ),
    );
  return row?.since ?? null;
}

/**
 * How a friend's ranking compares with the viewer's, over the courses both
 * have ranked (matched by id or equivalent identity, as `myRank` is).
 */
export function comparison(rows: readonly MemberListRow[], myTotal: number): ProfileComparison {
  const shared = rows.flatMap((row) => (row.myRank === null ? [] : [{ courseId: row.course.id, myRank: row.myRank, theirRank: row.rank }]));
  const result = compareRankings(shared, myTotal, rows.length);
  const split = result.biggestSplit;
  const course = split ? rows.find((row) => row.course.id === split.courseId)?.course : undefined;
  return {
    inCommon: result.inCommon,
    agreement: result.agreement,
    biggestSplit: split && course ? { course, myRank: split.myRank, theirRank: split.theirRank } : null,
  };
}

/**
 * A member's profile for the viewer.
 *
 * Returns:
 *     The profile, or null when the member is unknown or not the viewer's
 *     friend (indistinguishable on purpose).
 */
export async function memberProfile(db: Database, viewerId: string, username: string): Promise<Profile | null> {
  const member = await visibleMember(db, viewerId, username);
  if (!member) return null;
  const self = member.id === viewerId;
  const [theirs, mine, stats, since] = await Promise.all([
    memberRanking(db, member.id),
    self ? null : personalList(db, viewerId),
    profileStats(db, member.id),
    self ? null : friendsSince(db, viewerId, member.id),
  ]);
  const rows = relativeRows(theirs, mine ?? theirs);
  return {
    member: toPublicMember(member),
    relationship: self ? ProfileRelationship.Self : ProfileRelationship.Friends,
    friendsSince: since,
    stats,
    topFour: rows.slice(0, TOP_FOUR),
    comparison: mine ? comparison(rows, mine.length) : null,
  };
}
