import { count, eq, inArray } from "drizzle-orm";
import type { TopListDetail, TopListStanding } from "@coursebook/domain/social/types";
import type { Executor } from "../db/client";
import { courseRankings, rounds, userCourses, wantToPlay } from "../db/schema";
import {
  findPublishedList,
  friendsProgress,
  friendsWhoPlayed,
  playedOn,
  publishedLists,
  type FriendCourses,
  type PublishedList,
} from "../domain/top-lists";
import { friendMembers } from "./friends";
import { courseViews } from "./timeline";

/**
 * Published lists as checklists shared with friends (issue #17): the
 * viewer's and each friend's progress on every list, and one list with, per
 * course, the viewer's rounds, Want to play, and the friends who played it.
 * Reads only; the rules are in `domain/top-lists.ts`.
 */

async function loadLists(db: Executor): Promise<PublishedList[]> {
  const rows = await db
    .select({
      type: courseRankings.rankingType,
      scope: courseRankings.scopeCode,
      rank: courseRankings.rank,
      courseId: courseRankings.courseId,
      source: courseRankings.source,
      sourceYear: courseRankings.sourceYear,
    })
    .from(courseRankings);
  return publishedLists(rows);
}

/** The viewer's and their friends' list courses, keyed for the rules. */
async function whoPlayedWhat(db: Executor, viewerId: string): Promise<{ mine: Set<string>; friends: FriendCourses[] }> {
  const friends = await friendMembers(db, viewerId);
  const ids = [viewerId, ...friends.map((friend) => friend.id)];
  const rows = await db
    .select({ userId: userCourses.userId, courseId: userCourses.courseId })
    .from(userCourses)
    .where(inArray(userCourses.userId, ids));
  const byMember = new Map<string, Set<string>>();
  for (const row of rows) byMember.set(row.userId, (byMember.get(row.userId) ?? new Set()).add(row.courseId));
  return {
    mine: byMember.get(viewerId) ?? new Set(),
    friends: friends.map((friend) => ({ member: friend.member, courses: byMember.get(friend.id) ?? new Set() })),
  };
}

/** Every published list with the viewer's progress and their friends', in display order. */
export async function topListStandings(db: Executor, viewerId: string): Promise<TopListStanding[]> {
  const [lists, played] = await Promise.all([loadLists(db), whoPlayedWhat(db, viewerId)]);
  return lists.map((list) => ({ list: list.info, mine: playedOn(list, played.mine), friends: friendsProgress(list, played.friends) }));
}

/**
 * One published list for the viewer.
 *
 * Returns:
 *     The standing and every course in rank order with the viewer's rounds,
 *     Want to play and the friends who played it; null when no list has that
 *     type and scope.
 */
export async function topListDetail(db: Executor, viewerId: string, type: string, scope: string): Promise<TopListDetail | null> {
  const list = findPublishedList(await loadLists(db), type, scope);
  if (!list) return null;
  const courseIds = list.entries.map((entry) => entry.courseId);
  const [played, views, roundRows, wantedRows] = await Promise.all([
    whoPlayedWhat(db, viewerId),
    courseViews(db, courseIds),
    db
      .select({ courseId: rounds.courseId, rounds: count() })
      .from(rounds)
      .where(eq(rounds.userId, viewerId))
      .groupBy(rounds.courseId),
    db.select({ courseId: wantToPlay.courseId }).from(wantToPlay).where(eq(wantToPlay.userId, viewerId)),
  ]);
  const roundsAt = new Map(roundRows.map((row) => [row.courseId, row.rounds]));
  const wanted = new Set(wantedRows.map((row) => row.courseId));
  return {
    standing: { list: list.info, mine: playedOn(list, played.mine), friends: friendsProgress(list, played.friends) },
    entries: list.entries.flatMap((entry) => {
      const course = views.get(entry.courseId);
      return course
        ? [
            {
              course,
              rank: entry.rank,
              played: roundsAt.get(entry.courseId) ?? 0,
              wantToPlay: wanted.has(entry.courseId),
              friendsPlayed: friendsWhoPlayed(entry.courseId, played.friends),
            },
          ]
        : [];
    }),
  };
}
