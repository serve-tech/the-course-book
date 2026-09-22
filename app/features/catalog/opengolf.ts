import { z } from "zod";
import { courseSchema, normalizeName, type Course } from "./course";

/**
 * Pure parsing for OpenGolfAPI responses and its published CSV dataset.
 *
 * The REST endpoint is keyless and its field names vary between releases, so
 * every accessor accepts a list of aliases. The CSV dataset is the fallback
 * when the REST endpoint is unavailable; it is parsed once per process by the
 * server-side search module. Nothing here performs I/O.
 */

const rawSchema = z.record(z.string(), z.unknown());

export type RawCourse = z.infer<typeof rawSchema>;

/** First non-empty string (or non-zero number) among the given keys, else "". */
export function field(row: RawCourse, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && value !== 0) return String(value);
  }
  return "";
}

/** Locate the course array inside any of the response envelopes seen so far. */
export function extractCourses(value: unknown): RawCourse[] {
  if (Array.isArray(value)) return z.array(rawSchema).parse(value);
  const root = rawSchema.parse(value);
  const nested = rawSchema.safeParse(root["data"]);
  const candidates = [
    root["courses"],
    root["results"],
    root["items"],
    nested.success ? nested.data["courses"] : null,
    root["data"],
  ];
  return z.array(rawSchema).parse(candidates.find(Array.isArray) ?? []);
}

/**
 * Parse an RFC 4180 style CSV document into records keyed by the header row.
 * Handles quoted fields, doubled-quote escapes and CRLF line endings; blank
 * rows are dropped.
 */
export function parseCSV(text: string): RawCourse[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === undefined) continue;

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (character !== "\r") {
      value += character;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  const headers = rows.shift() ?? [];
  return rows
    .filter((values) => values.some((entry) => entry.length > 0))
    .map((values) => {
      const record: RawCourse = {};
      headers.forEach((header, index) => {
        record[header] = values[index] ?? "";
      });
      return record;
    });
}

const US_COUNTRY = /^(us|usa|united states|united states of america)$/i;

/**
 * Normalize one raw OpenGolfAPI record into the domain Course shape.
 *
 * A missing country is treated as the United States (the dataset is US
 * centric). Records without an id get a deterministic `api-` id from the
 * normalized name and location so repeated searches dedupe.
 */
export function parseAPICourse(raw: RawCourse): Course {
  const name = field(raw, "name", "course_name", "title").trim() || "Unnamed Course";
  const city = field(raw, "city").trim();
  const country = field(
    raw,
    "country",
    "country_name",
    "countryCode",
    "country_code",
    "nation",
  ).trim();
  const region = field(
    raw,
    "state",
    "state_code",
    "province",
    "province_code",
    "region",
    "region_code",
  ).trim();
  const isUS = !country || US_COUNTRY.test(country);
  const location =
    [city, region, country].filter(Boolean).join(", ") ||
    field(raw, "location", "address").trim();
  const id =
    field(raw, "id", "course_id") ||
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
      region.toUpperCase() === "MI" ? "michigan" : isUS ? "usa" : "international",
    logo: field(raw, "logo_url", "logo"),
    website: field(raw, "website", "website_url"),
  });
}

/**
 * Dataset search rule: every normalized query term must appear in the
 * normalized course name. Used for the CSV fallback only.
 */
export function matchesQuery(raw: RawCourse, query: string): boolean {
  const terms = normalizeName(query).split(" ").filter(Boolean);
  if (terms.length === 0) return false;
  const name = normalizeName(field(raw, "name", "course_name", "title"));
  return terms.every((term) => name.includes(term));
}
