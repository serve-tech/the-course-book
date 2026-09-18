import states from "../../shared/data/us-states.json";
import { normalizeName, type Course, RegionFilter } from "./course";
export const stateOptions = states;
export function stateCode(value: string): string {
  const upper = value.trim().toUpperCase();
  return (
    states.find(
      (state) => state.code === upper || state.name.toUpperCase() === upper,
    )?.code ?? ""
  );
}
export function stateName(code: string): string {
  return states.find((state) => state.code === code)?.name ?? "State";
}
const countries: readonly [RegExp, string][] = [
  [
    /scotland|england|wales|northern ireland|ireland|united kingdom|great britain/,
    "UK",
  ],
  [/canada/, "Canada"],
  [/australia/, "Australia"],
  [/new zealand/, "New Zealand"],
  [/japan/, "Japan"],
  [/france/, "France"],
  [/spain/, "Spain"],
  [/mexico/, "Mexico"],
  [/dominican republic/, "Dominican Republic"],
  [/south korea|korea/, "South Korea"],
  [/bermuda/, "Bermuda"],
  [/singapore/, "Singapore"],
  [/south africa/, "South Africa"],
  [/netherlands/, "Netherlands"],
];
export function countryFromLocation(location: string, country = ""): string {
  const explicit = normalizeName(country).replace(
    /\b(uk|u k)\b/g,
    "united kingdom",
  );
  if (/^(usa|us|united states|united states of america)$/.test(explicit))
    return "USA";
  for (const [pattern, name] of countries)
    if (pattern.test(explicit)) return name;
  for (const [pattern, name] of countries)
    if (pattern.test(normalizeName(location))) return name;
  return "USA";
}
export function isUSCourse(course: Course): boolean {
  return (
    ["USA", "US", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(
      course.country.trim().toUpperCase(),
    ) ||
    course.region.toLowerCase() === "usa" ||
    !!(course.usa || course.public || course.michigan)
  );
}
export function deriveState(course: Course): string {
  if (!isUSCourse(course)) return "";
  const direct = stateCode(course.state);
  if (direct) return direct;
  for (const part of course.location.split(",").reverse()) {
    const code =
      stateCode(part) || stateCode(part.match(/\b([A-Z]{2})\b/)?.[1] ?? "");
    if (code) return code;
  }
  return "";
}
export function withUSState(course: Course, code: string): Course {
  const state = stateCode(code);
  if (!state) return course;
  const city = course.city || course.location.split(",")[0]?.trim() || "";
  return {
    ...course,
    city,
    state,
    country: "USA",
    region: "usa",
    location: [city, state, "USA"].filter(Boolean).join(", "),
  };
}
export function matchesRegion(
  course: Course,
  filter: RegionFilter,
  selectedState: string,
): boolean {
  if (filter === RegionFilter.All) return true;
  const country = countryFromLocation(course.location);
  if (filter === RegionFilter.World) return country !== "USA";
  if (filter === RegionFilter.USA) return country === "USA";
  return (
    country === "USA" &&
    !!selectedState &&
    journalStateCode(course) === selectedState
  );
}

export function journalStateCode(course: Course): string {
  const valid = stateOptions.filter((option) => option.code !== "DC");
  const explicit = valid.find(
    (option) =>
      option.code === course.state.toUpperCase() ||
      option.name.toUpperCase() === course.state.toUpperCase(),
  );
  if (explicit) return explicit.code;
  const suffix = course.location
    .match(/,\s*([A-Z]{2})(?:,|$)/i)?.[1]
    ?.toUpperCase();
  if (suffix && valid.some((option) => option.code === suffix)) return suffix;
  return (
    valid.find((option) =>
      course.location.toUpperCase().includes(option.name.toUpperCase()),
    )?.code ?? ""
  );
}
