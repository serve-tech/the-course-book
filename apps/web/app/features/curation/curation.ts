import type { Course } from "@coursebook/domain/catalog/course";
import { topListTitle } from "@coursebook/domain/social/top-lists";
import { coursePath } from "../courses/paths";
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
 * keeping the published list being worked through (`from`), or, opened
 * from a course's page, returning there (`back=course`).
 *
 * Example:
 *     >>> curatePath({ list: { type: "global", scope: "GLOBAL" }, courseId: "c1" })
 *     "/curate?course=c1&from=world"
 *     >>> curatePath({ courseId: "c1", backToCourse: true })
 *     "/curate?course=c1&back=course"
 */
export function curatePath({
  list = null,
  courseId = null,
  backToCourse = false,
}: { list?: TopListRef | null; courseId?: string | null; backToCourse?: boolean } = {}): string {
  const params = new URLSearchParams();
  if (courseId) params.set("course", courseId);
  if (list) params.set("from", topListSlug(list));
  if (courseId && backToCourse) params.set("back", BACK_TO_COURSE);
  const query = params.toString();
  return "/curate" + (query ? "?" + query : "");
}

/** The `back` value that returns the photo picker to the course's page. */
export const BACK_TO_COURSE = "course";

/** Where the course list comes from, as its picker, progress and back link name it. */
export function sourceTitle(source: TopListRef | null): string {
  return source ? topListTitle(source.type, source.scope) : "Members' rankings";
}

/**
 * Where the photo picker goes back to, by its link and once a photo is set:
 * the course's page when it was opened from there, otherwise the course list
 * it came from.
 */
export function pickerReturn(course: Course, source: TopListRef | null, backToCourse: boolean): { path: string; label: string } {
  return backToCourse ? { path: coursePath(course.id), label: course.name } : { path: curatePath({ list: source }), label: sourceTitle(source) };
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
