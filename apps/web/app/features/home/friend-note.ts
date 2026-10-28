import type { Course } from "@coursebook/domain/catalog/course";
import type { ListEntry } from "@coursebook/domain/journal/types";
import { rankBadges } from "../top-lists/lists";

/**
 * What a friend's round means to the viewer, as Home's short note beside it:
 * the viewer's own rank when the course is on their list, otherwise the
 * course's first published rank. A friend's own rank is left to Activity;
 * it says little to anyone else (decision 2026-10-27).
 *
 * Note:
 *     The match is by course id. The API resolves equivalent course rows on
 *     some reads, so a missing match is not proof the viewer never played
 *     there; the note therefore never says "not played".
 */

/** The viewer's personal rank for each course on their list. */
export function myRanks(rows: readonly ListEntry[]): ReadonlyMap<string, number> {
  return new Map(rows.map((row) => [row.course.id, row.rank]));
}

/**
 * The note for a friend's round at a course.
 *
 * Returns:
 *     "Your #2" when the course is on the viewer's list; otherwise the first
 *     published rank, e.g. "USA #38"; null when the course is on neither.
 *
 * Example:
 *     >>> friendNote(bandonTrails, new Map([[bandonTrails.id, 2]]))
 *     "Your #2"
 */
export function friendNote(course: Course, ranks: ReadonlyMap<string, number>): string | null {
  const mine = ranks.get(course.id);
  if (mine !== undefined) return "Your #" + String(mine);
  const published = rankBadges(course)[0];
  return published ? published.label + " #" + String(published.rank) : null;
}
