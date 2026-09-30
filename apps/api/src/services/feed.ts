import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { FeedItemType, type FeedItem, type TimelineRound } from "@coursebook/domain/social/types";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import { CURSOR_TIMESTAMP_FORMAT, cursorTimestamp } from "../domain/cursor";
import { FriendshipStatus } from "../domain/friendship";
import { toPublicMember } from "./authz";
import { timelineRounds } from "./timeline";

/**
 * The Home feed: what the viewer's friends did, newest first (decision
 * 2026-09-29, social redesign). Derived on read from rounds; there is no
 * event table at this size. Imported history is included.
 *
 * Backfill rule, after Letterboxd's throttle for late diary entries: a round
 * logged more than `BACKFILL_DAYS` after the date played (or with no date)
 * does not appear on its own. A member's backfilled rounds from one UTC day
 * collapse into a single `backfill` item, so logging sixty old rounds never
 * floods friends' feeds. Grouping happens in SQL so each group is one row
 * and pages cannot split it.
 */

/** Days between playing and logging after which a round counts as backfill. */
export const BACKFILL_DAYS = 14;
/** Example rounds shown on a backfill item, one per course. */
export const BACKFILL_SAMPLE = 4;
/** Candidate rounds read per backfill item; enough to find `BACKFILL_SAMPLE` distinct courses in most groups. */
const BACKFILL_CANDIDATES = BACKFILL_SAMPLE * 3;

/**
 * Sort key of the last item on a page: its time and its key. A round item's
 * key is the round id; a backfill item's key is the smallest round id in the
 * group. Both are uuids, never member ids.
 */
export const feedCursorSchema = z.object({ at: cursorTimestamp, key: z.uuid() });
export type FeedCursor = z.infer<typeof feedCursorSchema>;

export interface FeedPage {
  items: FeedItem[];
  next: FeedCursor | null;
}

interface ItemRow extends Record<string, unknown> {
  /** The query emits only these two types. */
  type: FeedItemType;
  at_key: string;
  key: string;
  user_id: string;
  count: string;
  sample: string[] | null;
}

/**
 * One page of the viewer's feed.
 *
 * Args:
 *     db: Database handle.
 *     viewerId: The signed-in member; the feed covers their accepted,
 *         active friends.
 *     page: `after` is the previous page's last key (null for the first
 *         page); `limit` is the page size.
 */
export async function friendsFeed(
  db: Database,
  viewerId: string,
  page: { after: FeedCursor | null; limit: number },
): Promise<FeedPage> {
  const after = page.after
    ? sql`(items.at, items.key) < (${page.after.at}::timestamptz, ${page.after.key}::uuid)`
    : sql`true`;
  const { rows } = await db.execute<ItemRow>(sql`
    with friend_ids as (
      select case when f.requester_id = ${viewerId} then f.addressee_id else f.requester_id end as id
      from friendships f
      where f.status = ${FriendshipStatus.Accepted} and (f.requester_id = ${viewerId} or f.addressee_id = ${viewerId})
    ),
    logged as (
      select r.id, r.user_id, r.course_id, r.played_at, r.created_at,
        (r.played_at is null or (r.created_at at time zone 'UTC')::date - r.played_at > ${BACKFILL_DAYS}) as backfill
      from rounds r
      join friend_ids fi on fi.id = r.user_id
      join users u on u.id = r.user_id and u.deleted_at is null
    ),
    items as (
      select ${FeedItemType.Round}::text as type, l.created_at as at, l.id as key, l.user_id,
        1::bigint as count, array[l.id] as sample
      from logged l
      where not l.backfill
      union all
      select ${FeedItemType.Backfill}::text, max(l.created_at), min(l.id::text)::uuid, l.user_id,
        count(*), (array_agg(l.id order by l.played_at desc nulls last, l.id))[1:${BACKFILL_CANDIDATES}::int]
      from logged l
      where l.backfill
      group by l.user_id, (l.created_at at time zone 'UTC')::date
    )
    select items.type, to_char(items.at at time zone 'UTC', ${CURSOR_TIMESTAMP_FORMAT}) as at_key,
      items.key::text as key, items.user_id, items.count::text as count, items.sample::text[] as sample
    from items
    where ${after}
    order by items.at desc, items.key desc
    limit ${page.limit + 1}
  `);
  const shown = rows.slice(0, page.limit);
  const [rounds, members] = await Promise.all([
    timelineRounds(db, shown.flatMap((row) => row.sample ?? [])),
    memberViews(db, shown.map((row) => row.user_id)),
  ]);
  const items = shown.flatMap((row): FeedItem[] => {
    const member = members.get(row.user_id);
    if (!member) return [];
    const found = (row.sample ?? []).flatMap((id) => rounds.get(id) ?? []);
    if (row.type === FeedItemType.Round) {
      return found.length ? [{ id: "round:" + row.key, type: FeedItemType.Round, at: row.at_key, member, rounds: found.slice(0, 1), count: 1 }] : [];
    }
    return [{ id: "backfill:" + row.key, type: FeedItemType.Backfill, at: row.at_key, member, rounds: onePerCourse(found), count: Number(row.count) }];
  });
  const last = shown.at(-1);
  return { items, next: rows.length > page.limit && last ? { at: last.at_key, key: last.key } : null };
}

/** The first `BACKFILL_SAMPLE` rounds, skipping courses already shown. */
function onePerCourse(rounds: readonly TimelineRound[]): TimelineRound[] {
  const picked: TimelineRound[] = [];
  const seen = new Set<string>();
  for (const round of rounds) {
    if (picked.length === BACKFILL_SAMPLE) break;
    if (seen.has(round.course.id)) continue;
    seen.add(round.course.id);
    picked.push(round);
  }
  return picked;
}

/** Public projections of members by id. */
async function memberViews(db: Database, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, ReturnType<typeof toPublicMember>>();
  const rows = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((row) => [row.id, toPublicMember(row)]));
}
