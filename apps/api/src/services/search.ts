import type { Database } from "../db/client";
import { normalizeName, type Course } from "@coursebook/domain/catalog/course";
import { resolveSearchResults } from "../domain/course-search";
import {
  extractCoursePage,
  matchesQuery,
  parseAPICourse,
  type RawCourse,
} from "../domain/opengolf";
import type { SearchResult } from "@coursebook/domain/catalog/search-results";
import { allCourses } from "./catalog";
import { searchEnv } from "./env";

/**
 * Course discovery: OpenGolfAPI's REST search with its published CSV dataset
 * as the fallback. Results are resolved against the catalog so a known
 * course carries its row id; the catalog itself is never returned as a
 * search result.
 */

export interface SearchDependencies {
  fetcher?: typeof fetch;
  catalog: () => Promise<readonly Course[]>;
  apiUrl: string;
  csvUrl: string;
}

export const SEARCH_UNAVAILABLE =
  "Course search is temporarily unavailable. Please try again.";

const API_TIMEOUT_MS = 8_000;
const UPSTREAM_PAGE_SIZE = 50;
const CSV_TIMEOUT_MS = 15_000;

/** Course search as the API uses it; injectable for tests. */
export interface CourseSearch {
  /**
   * All resolved matches for `query`, alphabetically by name, location, then id.
   *
   * Raises:
   *     Error: `SEARCH_UNAVAILABLE` (with the cause) when both sources fail,
   *         or, when `signal` aborts, its abort reason as thrown by
   *         `throwIfAborted` (an AbortError by default; whatever the caller
   *         aborted with otherwise, such as @hono/node-server's string).
   */
  search(query: string, signal?: AbortSignal): Promise<SearchResult[]>;
}

export function createCourseSearch(deps: SearchDependencies): CourseSearch {
  const fetcher = deps.fetcher ?? ((input, init) => globalThis.fetch(input, init));
  let dataset: RawCourse[] | null = null;
  let loading: Promise<RawCourse[]> | null = null;

  const loadDataset = (signal: AbortSignal): Promise<RawCourse[]> => {
    if (dataset) return Promise.resolve(dataset);
    loading ??= fetcher(deps.csvUrl, {
      headers: { Accept: "text/csv" },
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(CSV_TIMEOUT_MS)]),
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("OpenGolfAPI dataset " + String(response.status));
        const { parseCSV } = await import("../domain/opengolf");
        dataset = parseCSV(await response.text());
        return dataset;
      })
      .catch((error: unknown) => {
        loading = null;
        throw error;
      });
    return loading;
  };

  const endpoint = async (text: string, signal: AbortSignal): Promise<RawCourse[]> => {
    // One deadline for the whole discovery, not eight seconds per upstream page.
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(API_TIMEOUT_MS)]);
    const rows: RawCourse[] = [];
    const seenPages = new Set<string>();
    for (;;) {
      requestSignal.throwIfAborted();
      const url = new URL(deps.apiUrl);
      url.searchParams.set("q", text);
      url.searchParams.set("limit", String(UPSTREAM_PAGE_SIZE));
      url.searchParams.set("offset", String(rows.length));
      const response = await fetcher(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: requestSignal,
      });
      if (!response.ok) throw new Error("OpenGolfAPI " + String(response.status));
      const page = extractCoursePage(await response.json());
      requestSignal.throwIfAborted();
      if (page.courses.length === 0) {
        if (page.total !== null && rows.length < page.total) throw new Error("OpenGolfAPI returned an incomplete search");
        return rows;
      }
      const fingerprint = JSON.stringify(page.courses);
      if (seenPages.has(fingerprint)) throw new Error("OpenGolfAPI repeated a search page");
      seenPages.add(fingerprint);
      rows.push(...page.courses);
      if (page.total !== null ? rows.length >= page.total : page.courses.length < UPSTREAM_PAGE_SIZE) return rows;
    }
  };

  return {
    /**
     * Search for courses by name.
     *
     * Raises:
     *     Error with `SEARCH_UNAVAILABLE` when both sources fail; the
     *     signal's abort reason when the request was cancelled.
     */
    async search(query: string, signal: AbortSignal = new AbortController().signal): Promise<SearchResult[]> {
      const text = query.trim();
      if (text.length < 2) return [];
      signal.throwIfAborted();
      let raw: RawCourse[];
      try {
        raw = await endpoint(text, signal);
      } catch (error) {
        if (signal.aborted) throw error;
        console.warn("OpenGolfAPI REST course search failed; trying dataset fallback", error);
        try {
          const rows = await loadDataset(signal);
          raw = rows.filter((row) => matchesQuery(row, text));
        } catch (fallbackError) {
          signal.throwIfAborted();
          console.warn("OpenGolfAPI dataset fallback failed", fallbackError);
          throw new Error(SEARCH_UNAVAILABLE, { cause: fallbackError });
        }
      }
      signal.throwIfAborted();
      const courses = raw.flatMap((record) => {
        try {
          return [parseAPICourse(record)];
        } catch (error) {
          console.warn("Unable to parse OpenGolfAPI course result", error, record);
          return [];
        }
      });
      const catalog = await deps.catalog();
      signal.throwIfAborted();
      return resolveSearchResults(courses, catalog);
    },
  };
}

let service: ReturnType<typeof createCourseSearch> | undefined;

/** Process-wide search bound to the environment and the catalog snapshot. */
export function searchCourses(
  db: Database,
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  service ??= createCourseSearch({
    catalog: () => allCourses(db),
    apiUrl: searchEnv().OPENGOLF_API_URL,
    csvUrl: searchEnv().OPENGOLF_CSV_URL,
  });
  return service.search(query, signal);
}

/** Exposed for tests that need a fresh service after changing dependencies. */
export function resetCourseSearch(): void {
  service = undefined;
}

export { normalizeName };
