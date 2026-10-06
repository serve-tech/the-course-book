import type { Course } from "@coursebook/domain/catalog/course";
import { resolveSearchResults } from "../domain/course-search";
import {
  extractCoursePage,
  matchesQuery,
  parseAPICourse,
  type RawCourse,
} from "../domain/opengolf";
import type { SearchResult } from "@coursebook/domain/catalog/search-results";

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

  /*
   * The download is shared by every search waiting for it, so only its own
   * timeout may cancel it: tied to the first caller's request, one member's
   * cancelled search failed everyone else's. Each caller stops waiting when
   * its own request is cancelled; the download carries on for the others.
   */
  const loadDataset = (signal: AbortSignal): Promise<RawCourse[]> => {
    if (dataset) return Promise.resolve(dataset);
    loading ??= fetcher(deps.csvUrl, {
      headers: { Accept: "text/csv" },
      cache: "no-store",
      signal: AbortSignal.timeout(CSV_TIMEOUT_MS),
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
    return untilAborted(loading, signal);
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

/**
 * Wait for `work`, or stop waiting when `signal` aborts.
 *
 * Args:
 *     work: A promise others may share; it is neither cancelled nor changed.
 *     signal: The caller's own signal.
 *
 * Returns:
 *     What `work` resolves to.
 *
 * Raises:
 *     An Error whose cause is the abort reason when the signal aborts first
 *     or already had (`search` then throws the reason itself); otherwise
 *     whatever `work` rejects with.
 *
 * Note:
 *     `work` is always raced, even for an aborted signal, so a later
 *     rejection of the shared promise is handled rather than unhandled
 *     (which would end the process).
 */
async function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  let stop: () => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    stop = () => {
      reject(new Error("Stopped waiting for the dataset: the search was cancelled.", { cause: signal.reason }));
    };
  });
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  try {
    return await Promise.race([work, aborted]);
  } finally {
    signal.removeEventListener("abort", stop);
  }
}
