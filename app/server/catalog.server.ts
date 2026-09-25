import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, Executor, Transaction } from "../db/client";
import { courseRankings, courses } from "../db/schema";
import { AppError, ErrorCode } from "./errors.server";
import {
  cloudLocation,
  courseSchema,
  normalizeName,
  type Course,
  type RankedCourse,
} from "../features/catalog/course";
import {
  courseView,
  rankSummaries,
  rankedCourses,
} from "../features/catalog/course-view";
import { countryFromLocation, stateCode } from "../features/catalog/geography";
import { aliases, canonicalize } from "../features/catalog/identity";

/**
 * Server-side course catalog: an in-process snapshot of every course and
 * published ranking for identity resolution and the Rankings page, plus the
 * find-or-create rule that turns a searched or hand-entered course into a
 * catalog row without creating duplicates.
 */

export interface CatalogSnapshot {
  courses: readonly Course[];
  byId: ReadonlyMap<string, Course>;
  rankings: readonly RankedCourse[];
  loadedAt: number;
}

const CATALOG_TTL_MS = 10 * 60_000;
let pending: Promise<CatalogSnapshot> | undefined;

async function loadSnapshot(db: Database): Promise<CatalogSnapshot> {
  const [courseRows, rankingRows] = await Promise.all([
    db.select().from(courses),
    db.select().from(courseRankings),
  ]);
  const summaries = rankSummaries(rankingRows);
  const byId = new Map(
    courseRows.map((row) => [row.id, courseView(row, summaries.get(row.id))]),
  );
  return {
    courses: [...byId.values()],
    byId,
    rankings: rankedCourses(rankingRows, byId),
    loadedAt: Date.now(),
  };
}

/** The catalog snapshot, refreshed after `CATALOG_TTL_MS` or an invalidation. */
export async function catalog(db: Database): Promise<CatalogSnapshot> {
  if (pending) {
    const current = await pending;
    if (Date.now() - current.loadedAt < CATALOG_TTL_MS) return current;
  }
  pending = loadSnapshot(db).catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}

/** Drop the snapshot so the next read sees a newly inserted course; call after commit. */
export function invalidateCatalog(): void {
  pending = undefined;
}

/** A course reference from a form: an existing row, or details to find or create. */
export const courseInputSchema = z.union([
  z.object({ courseId: z.uuid() }),
  z.object({
    name: z.string().trim().min(1),
    location: z.string().trim().default(""),
    city: z.string().trim().default(""),
    state: z.string().trim().default(""),
    country: z.string().trim().default(""),
    logo: z.string().trim().default(""),
    website: z.string().trim().default(""),
    isCustom: z.boolean().default(false),
  }),
]);

export type CourseInput = z.infer<typeof courseInputSchema>;

async function courseByStableId(
  executor: Executor,
  stableId: string,
): Promise<string | undefined> {
  const [row] = await executor
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.stableId, stableId));
  return row?.id;
}

/** First location segment as the city, unless it is really a state or country. */
function cityFromParts(parts: readonly string[], country: string): string | null {
  const [first] = parts;
  if (!first || parts.length < 2) return null;
  if (stateCode(first) || normalizeName(first) === normalizeName(country)) return null;
  return first;
}

/** Ensure a course row exists by id; throws a 404 `AppError` otherwise. */
export async function requireCourse(
  executor: Executor,
  courseId: string,
): Promise<string> {
  const [row] = await executor
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, courseId));
  if (!row) throw new AppError(404, ErrorCode.CourseNotFound, "Course not found.");
  return row.id;
}

/**
 * Resolve a course input to a catalog row id, inserting when nothing matches.
 *
 * Rules, in order (ported from the previous client-side `ensure`):
 * 1. An explicit `courseId` must exist.
 * 2. A known alias of the normalized name maps to a bundled stable id.
 * 3. Canonical Scottish geography replaces whatever location was supplied.
 * 4. Rows with the same `name_key` match only when country and the exact
 *    normalized location agree; a same-name course elsewhere is a different
 *    course.
 * 5. Otherwise a row is inserted. The transaction holds an advisory lock on
 *    the name key so two concurrent inserts cannot both miss.
 *
 * Args:
 *     tx: Open transaction.
 *     input: Parsed course input.
 *     createdBy: Acting user, recorded on inserted rows.
 *
 * Returns:
 *     The course row id and whether this call inserted it. When `created` is
 *     true the caller must call `invalidateCatalog()` after the transaction
 *     commits; invalidating earlier lets a concurrent load cache a snapshot
 *     that cannot see the uncommitted row.
 */
export async function findOrCreateCourse(
  tx: Transaction,
  input: CourseInput,
  createdBy: string | null,
): Promise<{ id: string; created: boolean }> {
  if ("courseId" in input) return { id: await requireCourse(tx, input.courseId), created: false };

  const course = canonicalize(courseSchema.parse({ id: "input", ...input }));
  const key = normalizeName(course.name);

  const stableId = aliases.get(key);
  if (stableId) {
    const id = await courseByStableId(tx, stableId);
    if (id) return { id, created: false };
  }

  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key || course.name}))`);

  const wantedCountry = countryFromLocation(course.location, course.country);
  const wantedLocation = normalizeName(course.location);
  const candidates = await tx
    .select()
    .from(courses)
    .where(
      key
        ? eq(courses.nameKey, key)
        : sql`lower(${courses.name}) = lower(${course.name})`,
    );
  const match = candidates.find(
    (row) =>
      countryFromLocation(cloudLocation(row), row.country) === wantedCountry &&
      normalizeName(cloudLocation(row)) === wantedLocation,
  );
  if (match) return { id: match.id, created: false };

  const parts = course.location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const last = parts.at(-1) ?? "";
  const [inserted] = await tx
    .insert(courses)
    .values({
      name: course.name,
      nameKey: key,
      city: course.city || cityFromParts(parts, wantedCountry),
      state:
        course.state ||
        (wantedCountry === "USA" && last.length === 2 ? last.toUpperCase() : null),
      country: wantedCountry,
      logoUrl: course.logo || null,
      websiteUrl: course.website || null,
      isCustom: input.isCustom,
      createdBy,
    })
    .returning({ id: courses.id });
  if (!inserted) throw new Error("Course insert returned no row");
  return { id: inserted.id, created: true };
}

/** Rankings and course views for the Rankings page. */
export async function publishedRankings(db: Database): Promise<readonly RankedCourse[]> {
  return (await catalog(db)).rankings;
}

/** All catalog courses as domain views (for search resolution). */
export async function allCourses(db: Database): Promise<readonly Course[]> {
  return (await catalog(db)).courses;
}
