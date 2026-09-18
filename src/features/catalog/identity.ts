import { normalizeName, type Course } from "./course";
import { countryFromLocation } from "./geography";
export const canonicalLocations = new Map(
  [
    ["Balcomie Links", "Anstruther, Fife, Scotland"],
    ["St. Andrews Links: Old", "St Andrews, Fife, Scotland"],
    ["Kilspindie Golf Club", "Aberlady, East Lothian, Scotland"],
    ["Dunbar Golf Club", "Dunbar, East Lothian, Scotland"],
    ["St. Andrews Links: Jubilee", "St Andrews, Fife, Scotland"],
    ["The Glen", "North Berwick, East Lothian, Scotland"],
  ].map(([name, location]) => [normalizeName(name ?? ""), location ?? ""]),
);
export function canonicalize(course: Course): Course {
  const location = canonicalLocations.get(normalizeName(course.name));
  if (!location) return course;
  const country = countryFromLocation(location);
  return {
    ...course,
    location,
    country,
    region: country === "USA" ? "usa" : "world",
    city: location.split(",")[0] ?? course.city,
    state: country === "USA" ? course.state : "",
  };
}
export const aliases = new Map([
  ["arcadia bluffs", "michigan11"],
  ["arcadia bluffs golf", "michigan11"],
  ["arcadia bluffs golf club", "michigan11"],
  ["arcadia bluffs the bluffs", "michigan11"],
  ["arcadia bluffs bluffs", "michigan11"],
  ["arcadia bluffs south", "michigan9"],
  ["arcadia bluffs south course", "michigan9"],
  ["forest dunes", "michigan10"],
  ["forest dunes golf", "michigan10"],
  ["forest dunes golf club", "michigan10"],
  ["forest dunes course", "michigan10"],
  ["pinehurst 2", "usa32"],
  ["pinehurst no 2", "usa32"],
  ["pinehurst number 2", "usa32"],
  // Compatibility with v174; the incorrect No. 4 mapping is tracked for separate correction.
  ["pinehurst 4", "usa80"],
  ["pinehurst no 4", "usa80"],
  ["pinehurst number 4", "usa80"],
  ["bethpage black", "usa38"],
  ["bethpage state park black", "usa38"],
  ["whistling straits straits", "usa26"],
  ["whistling straits straits course", "usa26"],
]);
const layoutWords = new Set(
  "north south east west old new black red championship straits irish river meadow valleys links dunes lakes mountain ridge heather quarry tribute fazio smith gailes bear wolverine church strand stadium ocean shore seaside".split(
    " ",
  ),
);
const genericWords = new Set(
  "golf club course courses links resort country and the at of".split(" "),
);
const tokens = (value: string) =>
  normalizeName(value)
    .split(" ")
    .filter((token) => token.length > 1);
export function resolveRanked(
  catalog: readonly Course[],
  name: string,
  location: string,
  strict = false,
): Course | undefined {
  const normalized = normalizeName(name);
  if (!normalized) return undefined;
  const alias = catalog.find((course) => course.id === aliases.get(normalized));
  if (alias) return alias;
  const ranked = catalog.filter(
    (course) => course.world || course.usa || course.public || course.michigan,
  );
  const exact = ranked.find(
    (course) => normalizeName(course.name) === normalized,
  );
  if (exact) return exact;
  const query = tokens(name);
  const direct = ranked.find((course) => {
    const canonical = tokens(course.name);
    const a = query.filter((token) => layoutWords.has(token)),
      b = canonical.filter((token) => layoutWords.has(token));
    return (
      canonical.length > 0 &&
      canonical.every((token) => query.includes(token)) &&
      query
        .filter((token) => !canonical.includes(token))
        .every((token) => genericWords.has(token)) &&
      a.every((token) => b.includes(token)) &&
      b.every((token) => a.includes(token))
    );
  });
  if (direct) return direct;
  let best: Course | undefined;
  let bestScore = 0,
    second = 0;
  for (const course of ranked) {
    const candidate = tokens(course.name),
      shared = query.filter((token) => candidate.includes(token));
    if (!shared.length) continue;
    let score =
      (0.5 * shared.length) / query.length +
      (0.3 * shared.length) / candidate.length;
    const locationTokens = location
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2);
    const courseTokens = course.location
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2);
    const sharedLocation = locationTokens.filter((token) =>
      courseTokens.includes(token),
    );
    if (sharedLocation.length)
      score += Math.min(0.14, 0.07 * sharedLocation.length);
    const a = query.filter((token) => layoutWords.has(token)),
      b = candidate.filter((token) => layoutWords.has(token));
    if (
      (a.length || b.length) &&
      !(a.length === b.length && a.every((token) => b.includes(token)))
    )
      score -= 0.3;
    if (
      tokens(location)
        .filter((token) => token.length > 2)
        .some((token) => tokens(course.location).includes(token))
    )
      score += 0.06;
    if (score > bestScore) {
      second = bestScore;
      bestScore = score;
      best = course;
    } else if (score > second) second = score;
  }
  return best &&
    bestScore >= (strict ? 0.78 : 0.6) &&
    (bestScore - second >= 0.035 || bestScore >= 0.84)
    ? best
    : undefined;
}
export function equivalentCourses(
  a: Course | undefined,
  b: Course | undefined,
): boolean {
  if (
    !a ||
    !b ||
    !normalizeName(a.name) ||
    normalizeName(a.name) !== normalizeName(b.name)
  )
    return false;
  const left = tokens(a.location),
    right = tokens(b.location);
  return (
    !left.length ||
    !right.length ||
    left.every((token) => right.includes(token)) ||
    right.every((token) => left.includes(token))
  );
}
export function informationScore(course: Course): number {
  return (
    (course.name.trim() ? 10 : 0) +
    (course.location.trim() ? 20 : 0) +
    Math.min(
      course.location.split(",").filter((part) => part.trim()).length,
      4,
    ) *
      12 +
    (course.city ? 8 : 0) +
    (course.state ? 10 : 0) +
    (course.country ? 10 : 0) +
    (course.website ? 3 : 0) +
    (course.logo ? 2 : 0) +
    (course.michigan || course.usa || course.world || course.public ? 2 : 0)
  );
}
export function deduplicateCourses(courses: readonly Course[]): Course[] {
  const result: Course[] = [];
  for (const course of courses) {
    const index = result.findIndex((existing) =>
      equivalentCourses(existing, course),
    );
    const existing = result[index];
    if (!existing) result.push(course);
    else if (informationScore(course) > informationScore(existing))
      result[index] = course;
  }
  return result;
}
