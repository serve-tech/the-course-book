import { and, asc, count, desc, eq, exists, gt, isNull, max, ne, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { Course } from "@coursebook/domain/catalog/course";
import type { Database, Executor, Transaction } from "../db/client";
import { courses, friendships, rounds, userCourses, users } from "../db/schema";
import { courseView } from "../domain/course-view";
import { BefriendChange, FriendshipStatus, befriend, relationshipFor } from "../domain/friendship";
import { equivalentCourses } from "../domain/identity";
import type {
  FriendRequests,
  MemberList,
  MemberListRow,
  MemberRelationship,
  PublicMember,
} from "@coursebook/domain/friends/types";
import { toPublicMember } from "./authz";
import { rankedViews } from "./catalog";
import { AppError, ErrorCode } from "./errors";
import { personalList } from "./journal";
import { lockMembers } from "./member-lock";

/**
 * Friends and read-only views of their lists (decision 2026-09-29,
 * friends-only visibility). A member sees their own list and their accepted
 * friends' lists; everyone else is "not found". Only the public projection of
 * a member (username, display name) ever leaves here.
 */

/** Rows of `users` that are accepted friends of the viewer. */
function isFriendOf(db: Executor, viewerId: string): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(friendships)
      .where(
        and(
          eq(friendships.status, FriendshipStatus.Accepted),
          or(
            and(eq(friendships.requesterId, viewerId), eq(friendships.addresseeId, users.id)),
            and(eq(friendships.addresseeId, viewerId), eq(friendships.requesterId, users.id)),
          ),
        ),
      ),
  );
}

/** The friendship row condition for a pair, in either direction; `b` may be a column. */
function pair(a: string, b: string | AnyColumn): SQL | undefined {
  return or(
    and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
    and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
  );
}

/** An active member by username (case-insensitive), or undefined. */
async function findMember(db: Executor, username: string) {
  const [member] = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(and(sql`lower(${users.username}) = lower(${username})`, isNull(users.deletedAt)));
  return member;
}

export interface MemberPage {
  members: PublicMember[];
  /** Username to pass as `after` for the next page; null on the last page. */
  nextCursor: string | null;
}

/**
 * One page of the viewer's friends, ordered by lowercased username.
 *
 * Args:
 *     db: Database handle.
 *     viewerId: The signed-in member, who is never listed.
 *     page: `after` is the previous page's cursor (null for the first page);
 *         `limit` is the page size.
 *
 * Returns:
 *     The friends and the cursor for the next page. Keyset pagination on
 *     `lower(username)` matches the case-insensitive unique index, so pages
 *     stay stable while friendships change.
 */
export async function memberPage(
  db: Database,
  viewerId: string,
  page: { after: string | null; limit: number },
): Promise<MemberPage> {
  const key = sql<string>`lower(${users.username})`;
  const rows = await db
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(
      and(
        ne(users.id, viewerId),
        isNull(users.deletedAt),
        isFriendOf(db, viewerId),
        page.after === null ? undefined : gt(key, page.after.toLowerCase()),
      ),
    )
    .orderBy(asc(key))
    .limit(page.limit + 1);
  const members = rows.slice(0, page.limit).map(toPublicMember);
  return {
    members,
    nextCursor: rows.length > page.limit ? (members.at(-1)?.username ?? null) : null,
  };
}

/** The viewer's accepted, active friends, with their ids for further queries (never for responses). */
export async function friendMembers(db: Executor, viewerId: string): Promise<{ id: string; member: PublicMember }[]> {
  const rows = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(and(ne(users.id, viewerId), isNull(users.deletedAt), isFriendOf(db, viewerId)));
  return rows.map((row) => ({ id: row.id, member: toPublicMember(row) }));
}

/** A member the viewer may see: themselves or an accepted friend. */
export interface VisibleMember {
  id: string;
  username: string;
  displayName: string;
}

/**
 * The member behind `username` if the viewer may see them: the viewer
 * themselves or an accepted friend. The username matches case-insensitively,
 * like the unique index.
 *
 * Returns:
 *     The member, or null when no such member exists or they are not the
 *     viewer's friend. The two are indistinguishable on purpose, so every
 *     read of another member goes through here.
 */
export async function visibleMember(db: Executor, viewerId: string, username: string): Promise<VisibleMember | null> {
  const member = await findMember(db, username);
  if (!member) return null;
  if (member.id === viewerId) return member;
  const [friendship] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(and(eq(friendships.status, FriendshipStatus.Accepted), pair(viewerId, member.id)));
  return friendship ? member : null;
}

/** One course on a member's ranking with their play history there. */
export interface MemberRankingRow {
  course: Course;
  rank: number;
  played: number;
  lastPlayedOn: string | null;
}

/** A member's ranking in rank order, with play counts and latest dated round per course. */
export async function memberRanking(db: Executor, userId: string): Promise<MemberRankingRow[]> {
  const playedRows = db
    .select({
      courseId: rounds.courseId,
      played: count().as("played"),
      lastPlayedOn: max(rounds.playedAt).as("last_played_on"),
    })
    .from(rounds)
    .where(eq(rounds.userId, userId))
    .groupBy(rounds.courseId)
    .as("played_rows");
  const rows = await db
    .select({
      course: courses,
      rank: userCourses.personalRank,
      // bigint comes back as a string from pg.
      played: sql<string>`coalesce(${playedRows.played}, 0)`,
      lastPlayedOn: playedRows.lastPlayedOn,
    })
    .from(userCourses)
    .innerJoin(courses, eq(courses.id, userCourses.courseId))
    .leftJoin(playedRows, eq(playedRows.courseId, userCourses.courseId))
    .where(eq(userCourses.userId, userId))
    .orderBy(userCourses.personalRank);
  const views = await rankedViews(db, rows.map((row) => row.course));
  return rows.map((row) => ({
    course: views.get(row.course.id) ?? courseView(row.course),
    rank: row.rank,
    played: Number(row.played),
    lastPlayedOn: row.lastPlayedOn ?? null,
  }));
}

/**
 * Rows of another member's ranking as the viewer sees them: whether each
 * course is on the viewer's list and at what rank. Matching uses the same
 * identity rule as the catalog, so a duplicate row for the same course still
 * reads as already listed.
 */
export function relativeRows(theirs: readonly MemberRankingRow[], mine: readonly { course: Course; rank: number }[]): MemberListRow[] {
  const byId = new Map(mine.map((entry) => [entry.course.id, entry.rank]));
  return theirs.map((row) => {
    const myRank = byId.get(row.course.id) ?? mine.find((entry) => equivalentCourses(entry.course, row.course))?.rank ?? null;
    return { ...row, onMyList: myRank !== null, myRank };
  });
}

/**
 * A member's list for a viewer: the viewer's own, or an accepted friend's,
 * with the member's play counts and the viewer's own rank per course.
 *
 * Returns:
 *     The list, or null when no such member exists or they are not the
 *     viewer's friend (the two are indistinguishable on purpose).
 */
export async function memberList(
  db: Database,
  viewerId: string,
  username: string,
): Promise<MemberList | null> {
  const member = await visibleMember(db, viewerId, username);
  if (!member) return null;
  const [theirs, mine] = await Promise.all([memberRanking(db, member.id), personalList(db, viewerId)]);
  return { member: toPublicMember(member), rows: relativeRows(theirs, mine) };
}

const MEMBER_SEARCH_LIMIT = 20;

/**
 * Find members by username, for sending friend requests.
 *
 * Args:
 *     db: Database handle.
 *     viewerId: The signed-in member, never included.
 *     query: Text contained in the username, case-insensitive; at least
 *         three characters after trimming (the contract enforces this, so
 *         short queries cannot list the membership). `%` and `_` match
 *         literally.
 *
 * Returns:
 *     Up to 20 active members, usernames starting with the query first, each
 *     with the viewer's relationship to them. Never a list, email or id.
 */
export async function searchMembers(db: Database, viewerId: string, query: string): Promise<MemberRelationship[]> {
  const needle = query.trim().toLowerCase().replace(/[\\%_]/g, (character) => "\\" + character);
  const key = sql<string>`lower(${users.username})`;
  const rows = await db
    .select({
      username: users.username,
      displayName: users.displayName,
      requesterId: friendships.requesterId,
      addresseeId: friendships.addresseeId,
      status: friendships.status,
    })
    .from(users)
    .leftJoin(friendships, pair(viewerId, users.id))
    .where(
      and(
        ne(users.id, viewerId),
        isNull(users.deletedAt),
        sql`${key} like ${"%" + needle + "%"} escape '\\'`,
      ),
    )
    .orderBy(desc(sql`${key} like ${needle + "%"} escape '\\'`), asc(key))
    .limit(MEMBER_SEARCH_LIMIT);
  return rows.map((row) => ({
    member: toPublicMember(row),
    relationship: relationshipFor(
      row.requesterId && row.addresseeId && row.status
        ? { requesterId: row.requesterId, addresseeId: row.addresseeId, status: row.status }
        : null,
      viewerId,
    ),
  }));
}

/** The viewer's pending requests, each side ordered by username. */
export async function friendRequests(db: Database, viewerId: string): Promise<FriendRequests> {
  const key = sql<string>`lower(${users.username})`;
  const pending = (other: AnyColumn, self: AnyColumn) =>
    db
      .select({ username: users.username, displayName: users.displayName })
      .from(friendships)
      .innerJoin(users, eq(users.id, other))
      .where(and(eq(friendships.status, FriendshipStatus.Pending), eq(self, viewerId), isNull(users.deletedAt)))
      .orderBy(asc(key));
  const [incoming, outgoing] = await Promise.all([
    pending(friendships.requesterId, friendships.addresseeId),
    pending(friendships.addresseeId, friendships.requesterId),
  ]);
  return { incoming: incoming.map(toPublicMember), outgoing: outgoing.map(toPublicMember) };
}

/**
 * Run `work` in one transaction holding both members' locks (member-lock.ts).
 *
 * Every change to a pair holds both locks, so changes to the same pair
 * serialize (crossing requests become one friendship) and each one also
 * serializes with either member's account deletion. Both accounts are
 * rechecked after the locks are granted, because the username lookup and
 * the session may predate a deletion.
 *
 * Raises:
 *     AppError: 401 `account_deleted` when the viewer's account was deleted;
 *         404 `member_not_found` when the target's was.
 */
async function withFriendshipLock<T>(
  db: Database,
  viewerId: string,
  targetId: string,
  work: (tx: Transaction, target: PublicMember) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const accounts = await lockMembers(tx, [viewerId, targetId]);
    const viewer = accounts.find((account) => account.id === viewerId);
    if (!viewer || viewer.deletedAt) throw new AppError(401, ErrorCode.AccountDeleted, "This account was deleted.");
    const target = accounts.find((account) => account.id === targetId);
    if (!target || target.deletedAt) throw new AppError(404, ErrorCode.MemberNotFound, "No member with that username.");
    return work(tx, toPublicMember(target));
  });
}

/**
 * Befriend a member: send a request, or accept theirs if they already asked.
 * Idempotent: repeating it changes nothing.
 *
 * Runs under both members' locks, so crossing requests become one accepted
 * friendship and a deleted account cannot regain relationships.
 *
 * Raises:
 *     AppError: 404 `member_not_found` for an unknown or deleted username;
 *         400 `validation_failed` for the viewer's own username; 401
 *         `account_deleted` when the viewer's account was deleted.
 */
export async function befriendMember(db: Database, viewerId: string, username: string): Promise<MemberRelationship> {
  const target = await findMember(db, username);
  if (!target) throw new AppError(404, ErrorCode.MemberNotFound, "No member with that username.");
  if (target.id === viewerId) throw new AppError(400, ErrorCode.ValidationFailed, "You can't add yourself as a friend.");
  return withFriendshipLock(db, viewerId, target.id, async (tx, member) => {
    const [row] = await tx.select().from(friendships).where(pair(viewerId, target.id));
    const { change, relationship } = befriend(row, viewerId);
    if (change === BefriendChange.Request) {
      await tx.insert(friendships).values({ requesterId: viewerId, addresseeId: target.id });
    } else if (change === BefriendChange.Accept && row) {
      await tx.update(friendships).set({ status: FriendshipStatus.Accepted, updatedAt: sql`now()` }).where(eq(friendships.id, row.id));
    }
    return { member, relationship };
  });
}

/**
 * End a friendship or pending request with a member, whichever direction:
 * unfriend, cancel your request, or decline theirs. Runs under both
 * members' locks.
 *
 * Raises:
 *     AppError: 404 `member_not_found` for an unknown or deleted username;
 *         404 `friendship_not_found` when there is nothing between you
 *         (including your own username); 401 `account_deleted` when the
 *         viewer's account was deleted.
 */
export async function removeFriend(db: Database, viewerId: string, username: string): Promise<void> {
  const target = await findMember(db, username);
  if (!target) throw new AppError(404, ErrorCode.MemberNotFound, "No member with that username.");
  await withFriendshipLock(db, viewerId, target.id, async (tx) => {
    const removed = await tx.delete(friendships).where(pair(viewerId, target.id)).returning({ id: friendships.id });
    if (!removed.length) throw new AppError(404, ErrorCode.FriendshipNotFound, "You are not friends and have no pending request.");
  });
}

/**
 * Delete every friendship and request of a member (account deletion).
 *
 * Call it inside the member's lock (`withJournalLock`): friendship changes
 * take the same lock, so none can add a row for the member afterwards.
 */
export async function removeAllFriendships(tx: Executor, userId: string): Promise<void> {
  await tx.delete(friendships).where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)));
}
