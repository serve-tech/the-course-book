import type { Course } from "./course";
import { equivalentCourses, informationScore } from "./identity";
export interface SearchResult {
  course: Course;
  display: Course;
}
export function combineSearchResults(
  local: readonly Course[],
  remote: readonly Course[],
): SearchResult[] {
  const groups: SearchResult[] = local.map((course) => ({
    course,
    display: course,
  }));
  const result: SearchResult[] = [];
  for (const item of [
    ...groups,
    ...remote.map((course) => ({ course, display: course })),
  ]) {
    const existing = result.find((group) =>
      equivalentCourses(group.display, item.display),
    );
    if (!existing) result.push(item);
    else if (
      informationScore(item.display) > informationScore(existing.display)
    )
      existing.display = item.display;
  }
  return result.slice(0, 10);
}
