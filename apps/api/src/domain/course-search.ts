import { normalizeName, type Course } from "@coursebook/domain/catalog/course";
import type { SearchResult } from "@coursebook/domain/catalog/search-results";
import { resolveAPICourse } from "./identity";

export const SEARCH_PAGE_SIZE = 10;

const alphabetical = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Resolve identities before deduplication and ordering, so a course appears once. */
export function resolveSearchResults(courses: readonly Course[], catalog: readonly Course[]): SearchResult[] {
  // Discovery may return thousands of matches. Normalize the catalog once;
  // the existing resolver still decides geography and ambiguous identities.
  const byName = new Map<string, Course[]>();
  for (const course of catalog) {
    const key = normalizeName(course.name);
    const bucket = byName.get(key) ?? [];
    bucket.push(course);
    byName.set(key, bucket);
  }
  const found = new Map<string, SearchResult>();
  for (const apiCourse of courses) {
    const known = resolveAPICourse(byName.get(normalizeName(apiCourse.name)) ?? [], apiCourse);
    const course = known
      ? {
          ...known,
          city: apiCourse.city || known.city,
          state: apiCourse.state || known.state,
          country: apiCourse.country || known.country,
          location: apiCourse.location || known.location,
        }
      : apiCourse;
    if (!found.has(course.id)) found.set(course.id, { course, display: course, catalogId: known?.id ?? null });
  }
  return sortSearchResults([...found.values()]);
}

function sortSearchResults(results: readonly SearchResult[]): SearchResult[] {
  return [...results].sort((a, b) =>
    alphabetical.compare(a.display.name, b.display.name) ||
    alphabetical.compare(a.display.location, b.display.location) ||
    a.course.id.localeCompare(b.course.id, "en"),
  );
}

/** Page the complete, ordered matches; an out-of-range page is empty. */
export function pageSearchResults(results: readonly SearchResult[], page: number) {
  const start = (page - 1) * SEARCH_PAGE_SIZE;
  return { results: results.slice(start, start + SEARCH_PAGE_SIZE), page, pageSize: SEARCH_PAGE_SIZE, total: results.length };
}

/** Catalog rows keep their own ids; search never merges existing database rows. */
export function catalogSearchResults(courses: readonly Course[]): SearchResult[] {
  return sortSearchResults(courses.map((course) => ({ course, display: course, catalogId: course.id })));
}

/** Literal case-insensitive substrings; all whitespace-separated terms must match. */
export function courseSearchPatterns(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean).map((term) => "%" + term.replace(/[\\%_]/g, (character) => "\\" + character) + "%");
}
