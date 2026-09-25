import type { Course } from "./course";

/** A course search hit: the catalog identity plus the richest display metadata. */
export interface SearchResult {
  course: Course;
  display: Course;
}
