import type { Database } from "../db/client";
import { normalizeName, type Course } from "../features/catalog/course";
import { resolveAPICourse } from "../features/catalog/identity";
import {
  extractCourses,
  matchesQuery,
  parseAPICourse,
  type RawCourse,
} from "../features/catalog/opengolf";
import { searchScore } from "../features/catalog/ranking-selectors";
import type { SearchResult } from "../features/catalog/search-results";
import { allCourses } from "./catalog.server";
import { searchEnv } from "./env.server";

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
const CSV_TIMEOUT_MS = 15_000;

export function createCourseSearch(deps: SearchDependencies) {
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
        const { parseCSV } = await import("../features/catalog/opengolf");
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
    const url = new URL(deps.apiUrl);
    url.searchParams.set("q", text);
    url.searchParams.set("limit", "50");
    const response = await fetcher(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(API_TIMEOUT_MS)]),
    });
    if (!response.ok) throw new Error("OpenGolfAPI " + String(response.status));
    return extractCourses(await response.json());
  };

  const build = (raw: RawCourse[], catalog: readonly Course[], text: string): SearchResult[] => {
    const found = new Map<string, Course>();
    for (const record of raw) {
      try {
        const apiCourse = parseAPICourse(record);
        const known = resolveAPICourse(catalog, apiCourse);
        const course = known
          ? {
              ...known,
              city: apiCourse.city || known.city,
              state: apiCourse.state || known.state,
              country: apiCourse.country || known.country,
              location: apiCourse.location || known.location,
            }
          : apiCourse;
        if (!found.has(course.id)) found.set(course.id, course);
      } catch (error) {
        console.warn("Unable to parse OpenGolfAPI course result", error, record);
      }
    }
    return [...found.values()]
      .sort((a, b) => searchScore(b, text) - searchScore(a, text))
      .slice(0, 10)
      .map((course) => ({ course, display: course }));
  };

  return {
    /**
     * Search for courses by name.
     *
     * Raises:
     *     Error with `SEARCH_UNAVAILABLE` when both sources fail; the
     *     caller's AbortError when the request was cancelled.
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
          raw = rows.filter((row) => matchesQuery(row, text)).slice(0, 50);
        } catch (fallbackError) {
          signal.throwIfAborted();
          console.warn("OpenGolfAPI dataset fallback failed", fallbackError);
          throw new Error(SEARCH_UNAVAILABLE, { cause: fallbackError });
        }
      }
      signal.throwIfAborted();
      return build(raw, await deps.catalog(), text);
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
