import type { Course } from "@coursebook/domain/catalog/course";
import { findList, ListTab, tabList, topListSlug, type TopListRef } from "../top-lists/lists";

/**
 * Pure rules for the curator screen (decision 2026-11-13): which courses it
 * lists, which a filter shows, how far along the photos are, and what to
 * search Commons for first.
 */

/** A course on the curator's list, with what to show beside it: "3 members" or "#12". */
export interface CurationEntry {
  course: Course;
  note: string;
}

/**
 * The published lists a curator can work through besides members' rankings:
 * the Courses page's national lists, which hold 290 courses between them.
 * Best in State is left out; its 1,130 courses would bury the rest.
 */
export const CURATION_LISTS: readonly TopListRef[] = [ListTab.World, ListTab.USA, ListTab.Public, ListTab.International].flatMap((tab) => {
  const list = tabList(tab, "");
  return list ? [list] : [];
});

/** The published list a `from` URL value names, or null for members' rankings (also when unknown). */
export function curationList(slug: string | null): TopListRef | null {
  return slug ? findList(slug, CURATION_LISTS) : null;
}

/**
 * The curator screen's URL: the course list, or one course's photo picker,
 * keeping the published list being worked through (`from`).
 *
 * Example:
 *     >>> curatePath({ list: { type: "global", scope: "GLOBAL" }, courseId: "c1" })
 *     "/curate?course=c1&from=world"
 */
export function curatePath({ list = null, courseId = null }: { list?: TopListRef | null; courseId?: string | null } = {}): string {
  const params = new URLSearchParams();
  if (courseId) params.set("course", courseId);
  if (list) params.set("from", topListSlug(list));
  const query = params.toString();
  return "/curate" + (query ? "?" + query : "");
}

/** "1 member", "3 members": how many members rank a course. */
export function membersNote(members: number): string {
  return String(members) + (members === 1 ? " member" : " members");
}

/** Which courses the list shows. */
export enum CurationFilter {
  /** Courses without a photo, where a curator's time matters most. */
  Missing = "missing",
  All = "all",
}

/** The curator screen's tabs; Curators is for admins only. */
export enum CurationTab {
  Photos = "photos",
  Curators = "curators",
}

/** The courses a filter keeps, in the order given (most-ranked or best-ranked first). */
export function filterCourses<T extends { course: Course }>(courses: readonly T[], filter: CurationFilter): T[] {
  return filter === CurationFilter.Missing ? courses.filter((entry) => !entry.course.photo) : [...courses];
}

/** How many of the courses have a photo. */
export function photoProgress(courses: readonly { course: Course }[]): { withPhoto: number; total: number } {
  return { withPhoto: courses.filter((entry) => entry.course.photo).length, total: courses.length };
}

/**
 * The filter to open on: courses missing a photo, unless none are, so the
 * screen never opens on an empty list.
 */
export function openingFilter(courses: readonly { course: Course }[]): CurationFilter {
  return courses.some((entry) => !entry.course.photo) ? CurationFilter.Missing : CurationFilter.All;
}

/**
 * The first Commons search for a course: its name without the layout or
 * course in a club ("Oakland Hills Country Club: South" → "Oakland Hills
 * Country Club", "Ballybunion Golf Club (Old)" → "Ballybunion Golf Club"),
 * because Commons files are named after the club.
 */
export function commonsQuery(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/:.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}
