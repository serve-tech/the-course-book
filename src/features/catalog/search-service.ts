import { z } from "zod";
import type { CatalogService } from "./catalog-service";
import {
  courseSchema,
  normalizeName,
  type Course,
} from "./course";
import {
  resolveAPICourse,
} from "./identity";
import type { SearchResult } from "./search-results";
import { searchScore } from "./ranking-selectors";

const rawSchema =
  z.record(
    z.string(),
    z.unknown(),
  );

type RawCourse =
  z.infer<typeof rawSchema>;

const string = (
  row: RawCourse,
  ...keys: string[]
): string => {
  for (const key of keys) {
    const value = row[key];

    if (
      (
        typeof value ===
          "string" &&
        value.length > 0
      ) ||
      (
        typeof value ===
          "number" &&
        value !== 0
      )
    )
      return String(value);
  }

  return "";
};

export function extractCourses(
  value: unknown,
): RawCourse[] {
  if (Array.isArray(value))
    return z
      .array(rawSchema)
      .parse(value);

  const root =
    rawSchema.parse(value);

  const nested =
    rawSchema.safeParse(
      root["data"],
    );

  const candidates = [
    root["courses"],
    root["results"],
    root["items"],
    nested.success
      ? nested.data["courses"]
      : null,
    root["data"],
  ];

  return z
    .array(rawSchema)
    .parse(
      candidates.find(
        Array.isArray,
      ) ?? [],
    );
}

export function parseAPICourse(
  raw: RawCourse,
): Course {
  const name =
    string(
      raw,
      "name",
      "course_name",
      "title",
    ).trim() ||
    "Unnamed Course";

  const city =
    string(
      raw,
      "city",
    ).trim();

  const country =
    string(
      raw,
      "country",
      "country_name",
      "countryCode",
      "country_code",
      "nation",
    ).trim();

  const region =
    string(
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
    /^(us|usa|united states|united states of america)$/i.test(
      country,
    );

  const location =
    [
      city,
      region,
      country,
    ]
      .filter(Boolean)
      .join(", ") ||
    string(
      raw,
      "location",
      "address",
    ).trim();

  const id =
    string(
      raw,
      "id",
      "course_id",
    ) ||
    (
      "api-" +
      normalizeName(name) +
      "-" +
      normalizeName(
        location,
      )
    )
      .replace(
        /[^a-z0-9]+/g,
        "-",
      )
      .replace(
        /^-|-$/g,
        "",
      );

  return courseSchema.parse({
    id,
    name,
    city,
    location,
    state: isUS
      ? region
      : "",
    country: isUS
      ? "USA"
      : country ||
        "International",
    region:
      region.toUpperCase() ===
      "MI"
        ? "michigan"
        : isUS
          ? "usa"
          : "international",
    logo: string(
      raw,
      "logo_url",
      "logo",
    ),
    website: string(
      raw,
      "website",
      "website_url",
    ),
  });
}

export class SearchService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly fetcher: typeof fetch =
      fetch,
  ) {}

  async search(
    query: string,
    session: number,
    signal: AbortSignal,
  ): Promise<SearchResult[]> {
    const text =
      query.trim();

    if (text.length < 2)
      return [];

    signal.throwIfAborted();

    /*
     * OpenGolfAPI is the only discovery source.
     *
     * Do not query the local Course Book catalog here.
     * The Course Book catalog is only used after an API
     * result exists, to determine whether that API course
     * corresponds to an existing Course Book identity.
     *
     * There is intentionally ONE request for a normal
     * course search. We do not make a second request with
     * state=MI, because the Log a Round search has no
     * Michigan filter.
     *
     * A state filter should only be added by a caller that
     * explicitly asks for one.
     */
    const url =
      "https://api.opengolfapi.org/v1/courses/search?q=" +
      encodeURIComponent(text) +
      "&limit=50&_cb=" +
      String(session);

    let rawCourses: RawCourse[];

    try {
      rawCourses =
        await this.endpoint(
          url,
          signal,
        );
    } catch (error) {
      if (signal.aborted)
        throw error;

      console.warn(
        "OpenGolfAPI course search failed",
        error,
      );

      return [];
    }

    signal.throwIfAborted();

    const courses =
      new Map<
        string,
        Course
      >();

    for (const raw of rawCourses) {
      try {
        const apiCourse =
          parseAPICourse(raw);

        /*
         * The API controls discovery.
         *
         * This lookup does NOT decide whether the API
         * result should exist in the search results.
         *
         * It only answers:
         *
         * "Is this API course confidently the same
         * physical course as an existing Course Book
         * course?"
         *
         * resolveAPICourse() is deliberately conservative
         * about same-name courses such as Cherry Creek.
         */
        const ranked =
          resolveAPICourse(
            this.catalog.all(),
            apiCourse,
          );

        const course =
          ranked
            ? {
                ...ranked,

                /*
                 * Preserve useful API location data when
                 * the existing Course Book record is missing
                 * one of those fields.
                 */
                city:
                  apiCourse.city ||
                  ranked.city,

                state:
                  apiCourse.state ||
                  ranked.state,

                country:
                  apiCourse.country ||
                  ranked.country,

                location:
                  apiCourse.location ||
                  ranked.location,
              }
            : apiCourse;

        /*
         * If the API result confidently maps to an existing
         * Course Book course, the Course Book ID becomes the
         * identity.
         *
         * Otherwise the API identity remains untouched.
         */
        if (!courses.has(course.id))
          courses.set(
            course.id,
            course,
          );
      } catch (error) {
        console.warn(
          "Unable to parse OpenGolfAPI course result",
          error,
          raw,
        );
      }
    }

    return [
      ...courses.values(),
    ]
      .sort(
        (a, b) =>
          searchScore(
            b,
            text,
          ) -
          searchScore(
            a,
            text,
          ),
      )
      .slice(0, 10)
      .map((course) => ({
        course,
        display: course,
      }));
  }

  private async endpoint(
    url: string,
    signal: AbortSignal,
  ): Promise<RawCourse[]> {
    const response =
      await this.fetcher(
        url,
        {
          headers: {
            Accept:
              "application/json",
          },
          cache:
            "no-store",
          signal:
            AbortSignal.any([
              signal,
              AbortSignal.timeout(
                8000,
              ),
            ]),
        },
      );

    if (!response.ok)
      throw new Error(
        "OpenGolfAPI " +
        String(
          response.status,
        ),
      );

    const data: unknown =
      await response.json();

    return extractCourses(
      data,
    );
  }
}