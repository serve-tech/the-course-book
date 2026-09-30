import type { PublicMember } from "@coursebook/domain/friends/types";
import { compareTopLists, topListTitle } from "@coursebook/domain/social/top-lists";
import type { MemberProgress, TopListInfo } from "@coursebook/domain/social/types";

/**
 * Pure rules for Top lists with friends' progress (issue #17): grouping the
 * published ranking rows into lists and counting who has played how much of
 * each. Progress counts the courses on a member's list by id; every course
 * on a list has been played. The service reads the rows; this decides.
 */

/** One published ranking row. */
export interface PublishedRank {
  type: string;
  scope: string;
  rank: number;
  courseId: string;
  source: string;
  sourceYear: number;
}

/** A published list and its entries in rank order. */
export interface PublishedList {
  info: TopListInfo;
  entries: PublishedRank[];
}

/** A friend and the ids of the courses on their list. */
export interface FriendCourses {
  member: PublicMember;
  courses: ReadonlySet<string>;
}

const key = (type: string, scope: string) => type + ":" + scope.toUpperCase();

/**
 * Group ranking rows into lists, in display order (national lists first,
 * then the rest by title), each with its entries in rank order.
 */
export function publishedLists(rows: readonly PublishedRank[]): PublishedList[] {
  const lists = new Map<string, PublishedRank[]>();
  for (const row of rows) lists.set(key(row.type, row.scope), [...(lists.get(key(row.type, row.scope)) ?? []), row]);
  return [...lists.values()]
    .flatMap((entries): PublishedList[] => {
      const first = entries[0];
      if (!first) return [];
      const info: TopListInfo = {
        type: first.type,
        scope: first.scope.toUpperCase(),
        title: topListTitle(first.type, first.scope),
        size: entries.length,
        source: first.source,
        sourceYear: first.sourceYear,
      };
      return [{ info, entries: [...entries].sort((a, b) => a.rank - b.rank) }];
    })
    .sort((a, b) => compareTopLists(a.info, b.info));
}

/** The list a type and scope name, or undefined. */
export function findPublishedList(lists: readonly PublishedList[], type: string, scope: string): PublishedList | undefined {
  return lists.find((list) => key(list.info.type, list.info.scope) === key(type, scope));
}

/** How many of the list's courses are in `courses`. */
export function playedOn(list: PublishedList, courses: ReadonlySet<string>): number {
  return list.entries.filter((entry) => courses.has(entry.courseId)).length;
}

/**
 * Friends' progress on a list: the friends who have played at least one of
 * its courses, most first, ties by display name then username.
 */
export function friendsProgress(list: PublishedList, friends: readonly FriendCourses[]): MemberProgress[] {
  return friends
    .map((friend) => ({ member: friend.member, played: playedOn(list, friend.courses) }))
    .filter((progress) => progress.played > 0)
    .sort(
      (a, b) =>
        b.played - a.played ||
        a.member.displayName.localeCompare(b.member.displayName) ||
        a.member.username.localeCompare(b.member.username),
    );
}

/** The friends who played a course, by display name. */
export function friendsWhoPlayed(courseId: string, friends: readonly FriendCourses[]): PublicMember[] {
  return friends
    .filter((friend) => friend.courses.has(courseId))
    .map((friend) => friend.member)
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.username.localeCompare(b.username));
}
