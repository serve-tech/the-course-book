import {
  normalizeName,
  RankingFilter,
  type Course,
  type RankedCourse,
} from "./course";
export function searchScore(
  course: Pick<Course, "name" | "location">,
  query: string,
): number {
  const tokenize = (value: string) =>
    normalizeName(value)
      .split(" ")
      .filter((token) => token.length > 1);
  const requested = tokenize(query),
    name = tokenize(course.name),
    location = tokenize(course.location);
  if (!requested.length) return 0;
  const nameHits = requested.filter((token) => name.includes(token)).length;
  const locationHits = requested.filter((token) =>
    location.includes(token),
  ).length;
  return (
    nameHits / requested.length +
    (0.35 * nameHits) / Math.max(1, name.length) +
    (0.08 * locationHits) / requested.length +
    (normalizeName(course.name) === normalizeName(query) ? 2 : 0)
  );
}
export function searchRankings(
  rows: readonly RankedCourse[],
  query: string,
): Course[] {
  const groups = new Map<
    string,
    { course: Course; score: number; rank: number }
  >();
  for (const row of rows) {
    const score = searchScore(row.course, query);
    if (score < 0.45) continue;
    const previous = groups.get(row.course.id);
    if (!previous || score > previous.score)
      groups.set(row.course.id, { course: row.course, score, rank: row.rank });
  }
  return [...groups.values()]
    .sort((a, b) => b.score - a.score || a.rank - b.rank)
    .map((row) => row.course);
}
export function selectRankings(
  rows: readonly RankedCourse[],
  filter: RankingFilter,
  state: string,
  query: string,
  mineOnly: boolean,
  played: Readonly<Record<string, number>>,
) {
  const type: string = filter === RankingFilter.Public ? "usa_public" : filter;
  const scoped = rows.filter(
    (row) =>
      row.type === type &&
      row.rank > 0 &&
      (type === "state" ? row.scope.toUpperCase() === state : row.rank <= 100),
  );
  const complete =
    (type === "state" ? !!state && scoped.length > 0 : scoped.length === 100) &&
    new Set(scoped.map((row) => row.rank)).size === scoped.length &&
    scoped.every((row) => row.course.id && row.course.name);
  const search = query.toLowerCase();
  return {
    complete,
    total: scoped.length,
    played: scoped.filter((row) => (played[row.course.id] ?? 0) > 0).length,
    rows: complete
      ? scoped
          .filter(
            (row) =>
              (!mineOnly || (played[row.course.id] ?? 0) > 0) &&
              (row.course.name.toLowerCase().includes(search) ||
                row.course.location.toLowerCase().includes(search)),
          )
          .sort((a, b) => a.rank - b.rank)
      : [],
  };
}
