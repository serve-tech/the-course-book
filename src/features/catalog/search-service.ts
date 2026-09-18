import { combineSearchResults, type SearchResult } from "./search-results";
import { z } from "zod";
import type { CatalogService } from "./catalog-service";
import { courseSchema, normalizeName, type Course } from "./course";
import { deduplicateCourses, resolveRanked } from "./identity";
import { searchRankings, searchScore } from "./ranking-selectors";
import type { SafeStorage } from "../../shared/lib/storage";
const rawSchema = z.record(z.string(), z.unknown());
type RawCourse = z.infer<typeof rawSchema>;
const string = (row: RawCourse, ...keys: string[]): string => {
  for (const key of keys) {
    const value = row[key];
    if (
      (typeof value === "string" && value.length > 0) ||
      (typeof value === "number" && value !== 0)
    )
      return String(value);
  }
  return "";
};
export function extractCourses(value: unknown): RawCourse[] {
  if (Array.isArray(value)) return z.array(rawSchema).parse(value);
  const root = rawSchema.parse(value),
    nested = rawSchema.safeParse(root["data"]);
  const candidates = [
    root["courses"],
    root["results"],
    root["items"],
    nested.success ? nested.data["courses"] : null,
    root["data"],
  ];
  return z.array(rawSchema).parse(candidates.find(Array.isArray) ?? []);
}
export function parseAPICourse(raw: RawCourse): Course {
  const name =
    string(raw, "name", "course_name", "title").trim() || "Unnamed Course";
  const city = string(raw, "city").trim(),
    country = string(
      raw,
      "country",
      "country_name",
      "countryCode",
      "country_code",
      "nation",
    ).trim();
  const region = string(
    raw,
    "state",
    "state_code",
    "province",
    "province_code",
    "region",
    "region_code",
  ).trim();
  // Retain v174's case-sensitive API country interpretation during compatibility migration.
  const isUS =
    !country ||
    /^(us|usa|united states|united states of america)$/.test(country);
  const location =
    [city, region, country].filter(Boolean).join(", ") ||
    string(raw, "location", "address").trim();
  const id =
    string(raw, "id", "course_id") ||
    ("api-" + normalizeName(name) + "-" + normalizeName(location))
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return courseSchema.parse({
    id,
    name,
    city,
    location,
    state: isUS ? region : "",
    country: isUS ? "USA" : country || "International",
    region:
      region.toUpperCase() === "MI"
        ? "michigan"
        : isUS
          ? "usa"
          : "international",
    logo: string(raw, "logo_url", "logo"),
    website: string(raw, "website", "website_url"),
  });
}
export class SearchService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly storage: SafeStorage,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  local(query: string): SearchResult[] {
    const text = query.toLowerCase();
    const courses = this.catalog
      .all()
      .filter(
        (course) =>
          course.name.toLowerCase().includes(text) ||
          course.location.toLowerCase().includes(text),
      )
      .slice(0, 10);
    return combineSearchResults(courses, []);
  }

  private async endpoint(
    url: string,
    signal: AbortSignal,
  ): Promise<RawCourse[]> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.fetcher(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        });
        if (!response.ok)
          throw new Error("OpenGolfAPI " + String(response.status));
        const data: unknown = await response.json();
        return extractCourses(data);
      } catch (error) {
        if (signal.aborted || attempt === 1) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 250 * (attempt + 1)),
        );
      }
    }
    return [];
  }
  async search(
    query: string,
    session: number,
    signal: AbortSignal,
  ): Promise<SearchResult[]> {
    const text = query.trim();
    if (text.length < 2) return this.local(query);
    try {
      await this.catalog.loadRankings();
    } catch (error) {
      console.warn("Published course search unavailable", error);
    }
    signal.throwIfAborted();
    const published = searchRankings(this.catalog.rankings, text);
    if (published.length)
      return combineSearchResults(deduplicateCourses(published), []);
    const base =
      "https://api.opengolfapi.org/v1/courses/search?q=" +
      encodeURIComponent(text);
    const results = await Promise.allSettled([
      this.endpoint(base + "&limit=50&_cb=" + String(session), signal),
      this.endpoint(base + "&state=MI&limit=50&_cb=" + String(session), signal),
    ]);
    signal.throwIfAborted();
    const aliases = this.storage.parse(
      "theCourseBookApiMappings",
      z.record(z.string(), z.string()),
      () => ({}),
    );
    const suggestions: Course[] = [];
    for (const result of results) {
      if (result.status === "rejected") {
        console.warn("Course search endpoint failed", result.reason);
        continue;
      }
      const parsed = result.value
        .map(parseAPICourse)
        .sort((a, b) => searchScore(b, text) - searchScore(a, text));
      for (const raw of parsed) {
        const cloudCandidates = searchRankings(this.catalog.rankings, raw.name);
        const cloudExact = cloudCandidates.find(
          (course) => normalizeName(course.name) === normalizeName(raw.name),
        );
        const first = cloudCandidates[0];
        const cloudMatch =
          cloudExact ??
          (first && searchScore(first, raw.name) >= 0.78 ? first : undefined);
        const ranked =
          cloudMatch ??
          resolveRanked(this.catalog.all(), raw.name, raw.location);
        if (ranked) {
          aliases[raw.id] = ranked.id;
          suggestions.push(ranked);
        } else suggestions.push(this.catalog.merge(raw));
      }
    }
    this.storage.save("theCourseBookApiMappings", aliases);
    return combineSearchResults(
      this.local(query).map((result) => result.course),
      suggestions,
    );
  }
}
