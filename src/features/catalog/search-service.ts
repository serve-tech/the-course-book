import { z } from "zod";
import type { CatalogService } from "./catalog-service";
import { courseSchema, normalizeName, type Course } from "./course";
import type { SearchResult } from "./search-results";
import { searchScore } from "./ranking-selectors";

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

  return z.array(rawSchema).parse(
    candidates.find(Array.isArray) ?? [],
  );
}

export function parseAPICourse(raw: RawCourse): Course {
  const name =
    string(raw, "name", "course_name", "title").trim() ||
    "Unnamed Course";

  const city = string(raw, "city").trim();

  const country = string(
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

  const isUS =
    !country ||
    /^(us|usa|united states|united states of america)$/i.test(country);

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
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /*
   * This is retained only as an emergency local helper for callers
   * that explicitly need local catalog search.
   *
   * The main course lookup path below is API-only.
   */
  local(query: string): SearchResult[] {
    const text = query.toLowerCase().trim();

    const courses = this.catalog
      .all()
      .filter(
        (course) =>
          course.name.toLowerCase().includes(text) ||
          course.location.toLowerCase().includes(text),
      )
      .sort(
        (a, b) =>
          searchScore(b, text) -
          searchScore(a, text),
      )
      .slice(0, 10);

    return courses.map((course) => ({
      course,
      display: course,
    }));
  }

  private async endpoint(
    url: string,
    signal: AbortSignal,
  ): Promise<RawCourse[]> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.fetcher(url, {
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(8000),
          ]),
        });

        if (!response.ok)
          throw new Error(
            "OpenGolfAPI " + String(response.status),
          );

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

    if (text.length < 2) return [];

    signal.throwIfAborted();

    /*
     * OpenGolfAPI is the source of truth for course discovery.
     *
     * Do NOT load the Course Book rankings here.
     * Do NOT use Top 100 membership to determine which courses
     * appear in search.
     */
    const base =
      "https://api.opengolfapi.org/v1/courses/search?q=" +
      encodeURIComponent(text);

    const results = await Promise.allSettled([
      this.endpoint(
        base +
          "&limit=50&_cb=" +
          String(session),
        signal,
      ),
      this.endpoint(
        base +
          "&state=MI&limit=50&_cb=" +
          String(session),
        signal,
      ),
    ]);

    signal.throwIfAborted();

    /*
     * Keep API results intact.
     *
     * The API's course ID is the identity used for deduplication.
     * We deliberately do NOT deduplicate based on course name or
     * fuzzy location matching because two different courses can
     * legitimately have the same name.
     */
    const courses = new Map<string, Course>();

    for (const result of results) {
      if (result.status === "rejected") {
        console.warn(
          "OpenGolfAPI course search endpoint failed",
          result.reason,
        );
        continue;
      }

      for (const raw of result.value) {
        try {
          const course = parseAPICourse(raw);

          if (!courses.has(course.id))
            courses.set(course.id, course);
        } catch (error) {
          console.warn(
            "Unable to parse OpenGolfAPI course result",
            error,
            raw,
          );
        }
      }
    }

    /*
     * The API is the discovery source.
     *
     * If the API returns nothing, return an empty result instead of
     * silently replacing the API with the Course Book's Top 100
     * catalog. This prevents the search experience from appearing
     * to work while actually hiding thousands of API courses.
     */
    const suggestions = [...courses.values()]
      .sort(
        (a, b) =>
          searchScore(b, text) -
          searchScore(a, text),
      )
      .slice(0, 10);

    return suggestions.map((course) => ({
      course,
      display: course,
    }));
  }
}