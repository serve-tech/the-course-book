import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Course } from "@coursebook/domain/catalog/course";
import type { TimelineRound } from "@coursebook/domain/social/types";
import type { Database, Executor } from "../db/client";
import { courses } from "../db/schema";
import { courseView } from "../domain/course-view";
import { CURSOR_TIMESTAMP_FORMAT, cursorTimestamp } from "../domain/cursor";
import { rankedViews } from "./catalog";
import { visibleMember, type VisibleMember } from "./friends";

/**
 * Member timelines: every round a member logged, newest played first, as
 * the profile's Timeline tab shows them (decision 2026-09-29, social
 * redesign). Friends see round dates and courses; nothing here reads score,
 * tees or notes.
 */

/**
 * Sort key of the last round on a page.
 *
 * Timelines sort by `played_at DESC NULLS LAST, created_at DESC, id DESC`:
 * dated rounds newest first, then undated rounds by when they were logged.
 * `undated` records which side of that boundary the key is on.
 */
export const timelineCursorSchema = z.object({
  undated: z.boolean(),
  playedOn: z.iso.date().nullable(),
  createdAt: cursorTimestamp,
  id: z.uuid(),
});
export type TimelineCursor = z.infer<typeof timelineCursorSchema>;

export interface TimelinePage {
  member: VisibleMember;
  rounds: TimelineRound[];
  /** Key of the page's last round when more rounds follow; null on the last page. */
  next: TimelineCursor | null;
}

interface PageRow extends Record<string, unknown> {
  id: string;
  played_on: string | null;
  created_key: string;
}

/**
 * The keyset condition "sorts after `after`" for the timeline order.
 *
 * After a dated key, later rows are the older dated rounds plus every
 * undated round; after an undated key, only undated rounds logged earlier.
 */
function afterCursor(after: TimelineCursor | null) {
  if (!after) return sql`true`;
  if (after.undated || after.playedOn === null)
    return sql`r.played_at is null and (r.created_at, r.id) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`;
  return sql`(r.played_at is null or (r.played_at, r.created_at, r.id) < (${after.playedOn}::date, ${after.createdAt}::timestamptz, ${after.id}::uuid))`;
}

/**
 * One page of a member's timeline, for the viewer.
 *
 * Args:
 *     db: Database handle.
 *     viewerId: The signed-in member.
 *     username: Whose timeline; the viewer or an accepted friend.
 *     page: `after` is the previous page's last key (null for the first
 *         page); `limit` is the page size.
 *
 * Returns:
 *     The page, or null when the member is unknown or not the viewer's
 *     friend (indistinguishable on purpose).
 */
export async function memberTimeline(
  db: Database,
  viewerId: string,
  username: string,
  page: { after: TimelineCursor | null; limit: number },
): Promise<TimelinePage | null> {
  const member = await visibleMember(db, viewerId, username);
  if (!member) return null;
  const { rows } = await db.execute<PageRow>(sql`
    select r.id, r.played_at::text as played_on,
      to_char(r.created_at at time zone 'UTC', ${CURSOR_TIMESTAMP_FORMAT}) as created_key
    from rounds r
    where r.user_id = ${member.id} and ${afterCursor(page.after)}
    order by r.played_at desc nulls last, r.created_at desc, r.id desc
    limit ${page.limit + 1}
  `);
  const shown = rows.slice(0, page.limit);
  const enriched = await timelineRounds(db, shown.map((row) => row.id));
  const last = shown.at(-1);
  return {
    member,
    rounds: shown.flatMap((row) => enriched.get(row.id) ?? []),
    next:
      rows.length > page.limit && last
        ? { undated: last.played_on === null, playedOn: last.played_on, createdAt: last.created_key, id: last.id }
        : null,
  };
}

interface RoundRow extends Record<string, unknown> {
  id: string;
  course_id: string;
  played_on: string | null;
  visit: string;
  rank: number;
}

/**
 * Timeline views of rounds by id: course, date, visit number and the
 * member's current rank for the course.
 *
 * The visit number counts each member's rounds at a course in played order
 * (undated first, then by date, then by when they were logged), over all of
 * that member's rounds there, not just the requested ones.
 *
 * Returns:
 *     Views keyed by round id; ids that no longer exist are absent.
 */
export async function timelineRounds(db: Executor, roundIds: readonly string[]): Promise<Map<string, TimelineRound>> {
  if (!roundIds.length) return new Map();
  const ids = sql.join(roundIds.map((id) => sql`${id}::uuid`), sql`, `);
  const { rows } = await db.execute<RoundRow>(sql`
    with wanted as (select id, user_id, course_id from rounds where id in (${ids})),
    visits as (
      select r.id,
        row_number() over (
          partition by r.user_id, r.course_id
          order by r.played_at asc nulls first, r.created_at asc, r.id asc
        ) as visit
      from rounds r
      where (r.user_id, r.course_id) in (select user_id, course_id from wanted)
    )
    select w.id, w.course_id, r.played_at::text as played_on, v.visit::text as visit, uc.personal_rank as rank
    from wanted w
    join rounds r on r.id = w.id
    join visits v on v.id = w.id
    join user_courses uc on uc.user_id = w.user_id and uc.course_id = w.course_id
  `);
  const views = await courseViews(db, rows.map((row) => row.course_id));
  return new Map(
    rows.flatMap((row) => {
      const course = views.get(row.course_id);
      if (!course) return [];
      const round: TimelineRound = { id: row.id, course, playedOn: row.played_on, visit: Number(row.visit), rank: row.rank };
      return [[row.id, round] as const];
    }),
  );
}

/** Domain views, with published ranks, of the courses with these ids. */
export async function courseViews(db: Executor, courseIds: readonly string[]): Promise<Map<string, Course>> {
  const unique = [...new Set(courseIds)];
  if (!unique.length) return new Map();
  const rows = await db.select().from(courses).where(inArray(courses.id, unique));
  const views = await rankedViews(db, rows);
  return new Map(rows.map((row) => [row.id, views.get(row.id) ?? courseView(row)]));
}
