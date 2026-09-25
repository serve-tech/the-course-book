/**
 * Build the catalog seed from the retired Supabase project's public data.
 *
 * Reads `courses` and `course_rankings` through the anonymous REST endpoint
 * (both tables are publicly readable; no credentials are involved), assigns
 * each bundled course id (usa1.., michigan1.., world1..) to its catalog row
 * using the identity rules, and writes:
 *
 * - apps/api/src/db/seed/courses.csv and rankings.csv for review and diffing
 * - the SQL body of the seed migration passed as the first argument
 *
 * Bundled courses with no catalog match are inserted with a deterministic
 * UUID derived from their stable id so re-running the script is idempotent.
 * Run with `pnpm seed:build src/db/migrations/<file>.sql` (the path is
 * relative to apps/api).
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudLocation, courseSchema, normalizeName, type Course } from "@coursebook/domain/catalog/course";
import {
  canonicalize,
  equivalentCourses,
  informationScore,
  resolveAPICourse,
  resolveRanked,
} from "../src/domain/identity";
import {
  countryFromLocation,
  deriveState,
  isUSCourse,
  withUSState,
} from "@coursebook/domain/catalog/geography";
import bundled from "../src/domain/bundled-courses.json";

const SUPABASE_URL = "https://naawqzwvegqbhioqqzkh.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_kZG71hYb0OkAOEA_bVbFBA_I7JhVkHJ";
const PAGE = 1000;

interface CourseRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  logo_url: string | null;
  website_url: string | null;
  is_custom: boolean | null;
  created_at: string | null;
}

interface RankingRow {
  id: string;
  course_id: string;
  ranking_type: string;
  rank: number;
  source: string;
  source_year: number;
  scope_code: string;
  source_url: string | null;
}

async function fetchAll<T>(table: string, order: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&order=${order}`,
      {
        headers: {
          apikey: PUBLISHABLE_KEY,
          Authorization: `Bearer ${PUBLISHABLE_KEY}`,
          Range: `${offset}-${offset + PAGE - 1}`,
        },
      },
    );
    if (!response.ok && response.status !== 206)
      throw new Error(`${table}: HTTP ${response.status}`);
    const page = (await response.json()) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** RFC 4122 version 5 style UUID from a name, without a dependency. */
function uuidFromName(name: string): string {
  const hash = createHash("sha1").update("coursebook.golf:" + name).digest();
  hash.writeUInt8((hash.readUInt8(6) & 0x0f) | 0x50, 6);
  hash.writeUInt8((hash.readUInt8(8) & 0x3f) | 0x80, 8);
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Normalize a bundled entry so its location components compare with catalog
 * rows: US courses get a state code and "City, ST, USA"; others get a
 * canonical country name and a city from the first location segment.
 */
function prepareBundled(raw: Course): Course {
  const course = canonicalize(raw);
  if (isUSCourse(course) || course.region === "michigan") {
    const code = deriveState(course);
    return code ? withUSState(course, code) : { ...course, country: "USA" };
  }
  // Keep the catalog's convention of naming the constituent country
  // ("Scotland", not "UK"); comparisons use countryFromLocation on both sides.
  const parts = course.location.split(",").map((part) => part.trim());
  return {
    ...course,
    country: course.country || parts.at(-1) || "",
    city: course.city || parts[0] || "",
  };
}

/** Location token sets agree in one direction (same rule as equivalentCourses). */
function sameLocation(a: Course, b: Course): boolean {
  const left = normalizeName(a.location).split(" ").filter(Boolean);
  const right = normalizeName(b.location).split(" ").filter(Boolean);
  return (
    !left.length ||
    !right.length ||
    left.every((token) => right.includes(token)) ||
    right.every((token) => left.includes(token))
  );
}

function courseFromRow(row: CourseRow): Course {
  return courseSchema.parse({
    id: row.id,
    name: row.name,
    location: cloudLocation(row),
    city: row.city ?? "",
    state: row.state ?? "",
    country: row.country ?? "",
  });
}

const sqlString = (value: string | null | undefined): string =>
  value === null || value === undefined ? "NULL" : `'${value.replace(/'/g, "''")}'`;

const csvCell = (value: string | number | boolean | null): string => {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function main(): Promise<void> {
  return run();
}

async function run(): Promise<void> {
  const target = process.argv[2];
  if (!target) throw new Error("Usage: build-seed.ts <migration.sql>");

  const [courseRows, rankingRows] = await Promise.all([
    fetchAll<CourseRow>("courses", "name"),
    fetchAll<RankingRow>("course_rankings", "ranking_type,scope_code,rank"),
  ]);
  console.log(`fetched ${courseRows.length} courses, ${rankingRows.length} rankings`);

  const catalog = courseRows.map(courseFromRow);
  const ranked = new Set(rankingRows.map((row) => row.course_id));
  const stableIds = new Map<string, string>();
  const inserted: CourseRow[] = [];
  const unmatched: string[] = [];
  const notes: string[] = [];
  const methods = new Map<string, number>();

  const assign = (course: Course, match: Course, method: string) => {
    const previous = stableIds.get(match.id);
    if (previous && previous !== course.id) {
      notes.push(`conflict: ${match.name} claimed by ${previous} and ${course.id}`);
      return;
    }
    stableIds.set(match.id, course.id);
    methods.set(method, (methods.get(method) ?? 0) + 1);
    if (method !== "exact") notes.push(`${method}: ${course.id} "${course.name}" -> "${match.name}" (${match.location})`);
  };

  for (const raw of bundled) {
    const course = prepareBundled(courseSchema.parse(raw));
    const exact = resolveAPICourse(catalog, course);
    if (exact) {
      assign(course, exact, "exact");
      continue;
    }
    // Names made only of generic words ("The Golf Club") normalize to "", so
    // compare the raw name and require an equivalent location for those.
    const sameName = normalizeName(course.name)
      ? catalog.filter(
          (row) => normalizeName(row.name) === normalizeName(course.name),
        )
      : catalog.filter(
          (row) =>
            row.name.trim().toLowerCase() === course.name.trim().toLowerCase() &&
            sameLocation(course, row),
        );
    const equivalent = sameName
      .filter((row) => equivalentCourses(course, row))
      .sort(
        (a, b) =>
          Number(ranked.has(b.id)) - Number(ranked.has(a.id)) ||
          informationScore(b) - informationScore(a),
      );
    if (equivalent[0]) {
      assign(course, equivalent[0], "equivalent-location");
      continue;
    }
    const compatible = sameName.filter(
      (row) =>
        !row.country ||
        !course.country ||
        countryFromLocation(row.location, row.country) ===
          countryFromLocation(course.location, course.country),
    );
    if (compatible.length === 1 && compatible[0]) {
      assign(course, compatible[0], "name-only");
      continue;
    }
    const fuzzy = resolveRanked(catalog, course.name, course.location, true);
    if (fuzzy) {
      assign(course, fuzzy, "fuzzy");
      continue;
    }
    unmatched.push(`${course.id} ${course.name} (${course.location})`);
    inserted.push({
      id: uuidFromName(course.id),
      name: course.name,
      city: course.city || null,
      state: course.state || null,
      country: course.country || "USA",
      logo_url: course.logo || null,
      website_url: course.website || null,
      is_custom: false,
      created_at: null,
    });
    stableIds.set(uuidFromName(course.id), course.id);
  }

  const allCourses = [...courseRows, ...inserted];
  const seen = new Map<string, string>();
  for (const row of allCourses) {
    const key = `${normalizeName(row.name)}|${row.country ?? "USA"}|${normalizeName(cloudLocation(row))}`;
    const other = seen.get(key);
    if (other) console.warn(`duplicate identity: ${row.name} (${row.id} and ${other})`);
    seen.set(key, row.id);
  }

  const scopeRank = new Set<string>();
  const courseType = new Set<string>();
  const knownIds = new Set(allCourses.map((row) => row.id));
  for (const ranking of rankingRows) {
    if (!knownIds.has(ranking.course_id))
      throw new Error(`ranking ${ranking.id} references unknown course ${ranking.course_id}`);
    const scope = `${ranking.ranking_type}|${ranking.scope_code}|${ranking.rank}`;
    if (scopeRank.has(scope)) throw new Error(`duplicate scope rank ${scope}`);
    scopeRank.add(scope);
    const type = `${ranking.course_id}|${ranking.ranking_type}`;
    if (courseType.has(type)) throw new Error(`duplicate course/type ${type}`);
    courseType.add(type);
  }

  const seedDir = fileURLToPath(new URL("../src/db/seed/", import.meta.url));
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(
    seedDir + "courses.csv",
    ["id,stable_id,name,city,state,country,website_url,logo_url,is_custom"]
      .concat(
        allCourses.map((row) =>
          [
            row.id,
            stableIds.get(row.id) ?? null,
            row.name,
            row.city,
            row.state,
            row.country ?? "USA",
            row.website_url,
            row.logo_url,
            row.is_custom ?? false,
          ]
            .map(csvCell)
            .join(","),
        ),
      )
      .join("\n") + "\n",
  );
  writeFileSync(
    seedDir + "rankings.csv",
    ["id,course_id,ranking_type,scope_code,rank,source,source_year,source_url"]
      .concat(
        rankingRows.map((row) =>
          [
            row.id,
            row.course_id,
            row.ranking_type,
            row.scope_code,
            row.rank,
            row.source,
            row.source_year,
            row.source_url,
          ]
            .map(csvCell)
            .join(","),
        ),
      )
      .join("\n") + "\n",
  );

  const courseValues = allCourses.map((row) =>
    [
      sqlString(row.id),
      sqlString(stableIds.get(row.id) ?? null),
      sqlString(row.name),
      sqlString(normalizeName(row.name)),
      sqlString(row.city),
      sqlString(row.state),
      sqlString(row.country ?? "USA"),
      sqlString(row.logo_url),
      sqlString(row.website_url),
      row.is_custom ? "true" : "false",
      row.created_at ? sqlString(row.created_at) : "now()",
    ].join(", "),
  );
  const rankingValues = rankingRows.map((row) =>
    [
      sqlString(row.id),
      sqlString(row.course_id),
      sqlString(row.ranking_type),
      String(row.rank),
      sqlString(row.scope_code),
      sqlString(row.source),
      String(row.source_year),
      sqlString(row.source_url),
    ].join(", "),
  );

  const sql = [
    "-- Generated by scripts/build-seed.ts from the public catalog. Do not edit by hand;",
    "-- catalog corrections are new migrations.",
    "INSERT INTO courses (id, stable_id, name, name_key, city, state, country, logo_url, website_url, is_custom, created_at) VALUES",
    courseValues.map((value) => `  (${value})`).join(",\n"),
    "ON CONFLICT (id) DO NOTHING;",
    "",
    "INSERT INTO course_rankings (id, course_id, ranking_type, rank, scope_code, source, source_year, source_url) VALUES",
    rankingValues.map((value) => `  (${value})`).join(",\n"),
    "ON CONFLICT (id) DO NOTHING;",
    "",
  ].join("\n");
  writeFileSync(target, sql);

  console.log(
    `stable ids assigned: ${stableIds.size}/${bundled.length} (${[...methods].map(([k, v]) => `${k} ${v}`).join(", ")}); inserted ${inserted.length}`,
  );
  if (notes.length) console.log("review:\n  " + notes.join("\n  "));
  if (unmatched.length) console.log("inserted (no catalog match):\n  " + unmatched.join("\n  "));
  console.log(`wrote ${target}`);
}

await main();
