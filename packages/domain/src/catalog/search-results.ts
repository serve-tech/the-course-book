import type { Course } from "./course";

export enum CourseSearchSource {
  Catalog = "catalog",
  External = "external",
}

/**
 * A course search hit: the catalog identity plus the richest display metadata.
 *
 * `catalogId` is the course's catalog row id when the hit resolved to a
 * catalog course, and null otherwise. It records where the hit came from and
 * is never inferred from `course.id`: OpenGolfAPI's own course ids are uuids
 * too, so an id's shape says nothing about whether our database has it.
 */
export interface SearchResult {
  course: Course;
  display: Course;
  catalogId: string | null;
}
