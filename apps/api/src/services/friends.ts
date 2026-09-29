import { and, asc, desc, eq, exists, gt, isNull, ne, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { Database, Executor } from "../db/client";
import { courses, friendships, userCourses, users } from "../db/schema";
import { courseView } from "../domain/course-view";
import { BefriendChange, befriend, pairKey, relationshipFor } from "../domain/friendship";
import { equivalentCourses } from "../domain/identity";
import type {
  FriendRequests,
  MemberList,
  MemberRelationship,
  PublicMember,
} from "@coursebook/domain/friends/types";
import { toPublicMember } from "./authz";
import { rankedViews } from "./catalog";
import { AppError, ErrorCode } from "./errors";
import { personalList } from "./journal";

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
          eq(friendships.status, "accepted"),
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

/**
 * A member's list for a viewer: the viewer's own, or an accepted friend's.
 * The username matches case-insensitively, like the unique index.
 * `onMyList` uses the same identity rule as the catalog so a duplicate row
 * for the same course still reads as already listed.
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
  const member = await findMember(db, username);
  if (!member) return null;
  if (member.id !== viewerId) {
    const [friendship] = await db
      .select({ id: friendships.id })
      .from(friendships)
      .where(and(eq(friendships.status, "accepted"), pair(viewerId, member.id)));
    if (!friendship) return null;
  }
  const [list, own] = await Promise.all([
    db
      .select({ course: courses, rank: userCourses.personalRank })
      .from(userCourses)
      .innerJoin(courses, eq(courses.id, userCourses.courseId))
      .where(eq(userCourses.userId, member.id))
      .orderBy(userCourses.personalRank),
    personalList(db, viewerId),
  ]);
  const views = await rankedViews(db, list.map((row) => row.course));
  const ownCourses = own.map((entry) => entry.course);
  const ownIds = new Set(ownCourses.map((course) => course.id));
  return {
    member: toPublicMember(member),
    rows: list.map((row) => {
      const course = views.get(row.course.id) ?? courseView(row.course);
      return {
        course,
        rank: row.rank,
        onMyList: ownIds.has(course.id) || ownCourses.some((mine) => equivalentCourses(mine, course)),
      };
    }),
  };
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
      .where(and(eq(friendships.status, "pending"), eq(self, viewerId), isNull(users.deletedAt)))
      .orderBy(asc(key));
  const [incoming, outgoing] = await Promise.all([
    pending(friendships.requesterId, friendships.addresseeId),
    pending(friendships.addresseeId, friendships.requesterId),
  ]);
  return { incoming: incoming.map(toPublicMember), outgoing: outgoing.map(toPublicMember) };
}

/**
 * Befriend a member: send a request, or accept theirs if they already asked.
 * Idempotent: repeating it changes nothing.
 *
 * Runs in one transaction under an advisory lock on the pair, so crossing
 * requests from both members end as one accepted friendship.
 *
 * Raises:
 *     AppError: 404 `member_not_found` for an unknown or deleted username;
 *         400 `validation_failed` for the viewer's own username.
 */
export async function befriendMember(db: Database, viewerId: string, username: string): Promise<MemberRelationship> {
  const target = await findMember(db, username);
  if (!target) throw new AppError(404, ErrorCode.MemberNotFound, "No member with that username.");
  if (target.id === viewerId) throw new AppError(400, ErrorCode.ValidationFailed, "You can't add yourself as a friend.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${pairKey(viewerId, target.id)}))`);
    const [row] = await tx.select().from(friendships).where(pair(viewerId, target.id));
    const { change, relationship } = befriend(row, viewerId);
    if (change === BefriendChange.Request) {
      await tx.insert(friendships).values({ requesterId: viewerId, addresseeId: target.id });
    } else if (change === BefriendChange.Accept && row) {
      await tx.update(friendships).set({ status: "accepted", updatedAt: sql`now()` }).where(eq(friendships.id, row.id));
    }
    return { member: toPublicMember(target), relationship };
  });
}

/**
 * End a friendship or pending request with a member, whichever direction:
 * unfriend, cancel your request, or decline theirs.
 *
 * Raises:
 *     AppError: 404 `member_not_found` for an unknown or deleted username;
 *         404 `friendship_not_found` when there is nothing between you.
 */
export async function removeFriend(db: Database, viewerId: string, username: string): Promise<void> {
  const target = await findMember(db, username);
  if (!target) throw new AppError(404, ErrorCode.MemberNotFound, "No member with that username.");
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${pairKey(viewerId, target.id)}))`);
    const removed = await tx.delete(friendships).where(pair(viewerId, target.id)).returning({ id: friendships.id });
    if (!removed.length) throw new AppError(404, ErrorCode.FriendshipNotFound, "You are not friends and have no pending request.");
  });
}

/** Delete every friendship and request of a member (account deletion). */
export async function removeAllFriendships(tx: Executor, userId: string): Promise<void> {
  await tx.delete(friendships).where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)));
}
