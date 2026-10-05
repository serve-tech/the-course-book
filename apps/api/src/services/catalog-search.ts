import { and, ilike } from "drizzle-orm";
import type { Database } from "../db/client";
import { courses } from "../db/schema";
import { catalogSearchResults, courseSearchPatterns, pageSearchResults } from "../domain/course-search";
import { rankedViews } from "./catalog";

/** Search stored names directly; a catalog search never calls course discovery. */
export async function searchCatalogCourses(db: Database, query: string, page: number) {
  const patterns = courseSearchPatterns(query);
  if (patterns.length === 0) return pageSearchResults([], page);
  const rows = await db.select().from(courses).where(and(...patterns.map((pattern) => ilike(courses.name, pattern))));
  const views = await rankedViews(db, rows);
  return pageSearchResults(catalogSearchResults([...views.values()]), page);
}
