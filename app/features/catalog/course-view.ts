import type { CourseRankingRow, CourseRow } from "../../db/schema";
import { cloudLocation, courseSchema, type Course, type RankedCourse } from "./course";
import { canonicalize } from "./identity";

/**
 * Pure adapters from database rows to the domain `Course` shape used by the
 * identity rules, selectors and components. The course id is the row uuid.
 */

export interface RankSummary {
  world?: number;
  usa?: number;
  public?: number;
  michigan?: number;
}

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
      location: cloudLocation(row) || "Location not specified",
      city: row.city ?? "",
      state: row.state ?? "",
      country: row.country,
      region: region(row.country, row.state),
      world: ranks.world ?? null,
      usa: ranks.usa ?? null,
      public: ranks.public ?? null,
      michigan: ranks.michigan ?? null,
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
    if (row.rankingType === "world") summary.world = row.rank;
    else if (row.rankingType === "usa") summary.usa = row.rank;
    else if (row.rankingType === "usa_public") summary.public = row.rank;
    else if (row.scopeCode.toUpperCase() === "MI") summary.michigan = row.rank;
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
