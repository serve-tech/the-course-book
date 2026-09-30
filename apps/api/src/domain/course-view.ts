import type { CourseRankingRow, CourseRow } from "../db/schema";
import { cloudLocation, courseSchema, type Course, type RankedCourse } from "@coursebook/domain/catalog/course";
import { canonicalize } from "./identity";

/**
 * Pure adapters from database rows to the domain `Course` shape used by the
 * identity rules, selectors and components. The course id is the row uuid.
 */

export interface RankSummary {
  world?: number;
  usa?: number;
  public?: number;
  /** Rank on the course's state list; a course is on at most one. */
  state?: number;
  /** The same rank when that list is Michigan's (legacy display field). */
  michigan?: number;
}

/** Placeholder location for courses with no city, state or country. */
export const UNKNOWN_LOCATION = "Location not specified";

function region(country: string, state: string | null): string {
  if (country.toUpperCase() !== "USA") return "international";
  return state?.toUpperCase() === "MI" ? "michigan" : "usa";
}

/** Domain view of a course row, with canonical geography applied. */
export function courseView(row: CourseRow, ranks: RankSummary = {}): Course {
  return canonicalize(
    courseSchema.parse({
      id: row.id,
      name: row.name,
      location: cloudLocation(row) || UNKNOWN_LOCATION,
      city: row.city ?? "",
      state: row.state ?? "",
      country: row.country,
      region: region(row.country, row.state),
      world: ranks.world ?? null,
      usa: ranks.usa ?? null,
      public: ranks.public ?? null,
      michigan: ranks.michigan ?? null,
      stateRank: ranks.state ?? null,
      logo: row.logoUrl ?? "",
      website: row.websiteUrl ?? "",
    }),
  );
}

/** Per-course rank summary from published ranking rows. */
export function rankSummaries(
  rankings: readonly CourseRankingRow[],
): Map<string, RankSummary> {
  const result = new Map<string, RankSummary>();
  for (const row of rankings) {
    const summary = result.get(row.courseId) ?? {};
    // Read as a string: the column may hold a list type newer than this release.
    const type: string = row.rankingType;
    if (type === "world") summary.world = row.rank;
    else if (type === "usa") summary.usa = row.rank;
    else if (type === "usa_public") summary.public = row.rank;
    else if (type === "state") {
      summary.state = row.rank;
      if (row.scopeCode.toUpperCase() === "MI") summary.michigan = row.rank;
    }
    // Other list types are skipped: a release must not misread a list type
    // that a newer release's migration adds while it is still serving.
    result.set(row.courseId, summary);
  }
  return result;
}

/** Ranked list entries for the selectors, skipping rankings whose course is missing. */
export function rankedCourses(
  rankings: readonly CourseRankingRow[],
  courses: ReadonlyMap<string, Course>,
): RankedCourse[] {
  return rankings.flatMap((row) => {
    const course = courses.get(row.courseId);
    return course
      ? [{ course, rank: row.rank, type: row.rankingType, scope: row.scopeCode }]
      : [];
  });
}
