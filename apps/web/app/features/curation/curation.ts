import type { CurationCourse } from "@coursebook/domain/curation/types";

/**
 * Pure rules for the curator screen (decision 2026-11-13): which courses a
 * filter shows, how far along the photos are, and what to search Commons
 * for first.
 */

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

/** The courses a filter keeps, in the order given (most-ranked first). */
export function filterCourses(courses: readonly CurationCourse[], filter: CurationFilter): CurationCourse[] {
  return filter === CurationFilter.Missing ? courses.filter((entry) => !entry.course.photo) : [...courses];
}

/** How many of the courses have a photo. */
export function photoProgress(courses: readonly CurationCourse[]): { withPhoto: number; total: number } {
  return { withPhoto: courses.filter((entry) => entry.course.photo).length, total: courses.length };
}

/**
 * The filter to open on: courses missing a photo, unless none are, so the
 * screen never opens on an empty list.
 */
export function openingFilter(courses: readonly CurationCourse[]): CurationFilter {
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
