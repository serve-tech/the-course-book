import { z } from "zod";
import bundled from "./bundled-courses.json";
import {
  cloudLocation,
  courseSchema,
  normalizeName,
  type Course,
  type RankedCourse,
} from "./course";
import {
  aliases,
  canonicalize,
  canonicalLocations,
  resolveRanked,
} from "./identity";
import { countryFromLocation } from "./geography";
import type { CatalogRepository, CourseRow } from "./catalog-repository";
import type { SafeStorage } from "../../shared/lib/storage";
const mapSchema = z.record(z.string(), z.string());
const locationSchema = z.record(
  z.string(),
  z.object({
    location: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
  }),
);
const mappingKey = "theCourseBookCloudCourseMapV3";
export class CatalogService {
  private records = new Map<string, Course>();
  private readonly bundledIds = new Set(bundled.map((course) => course.id));
  private readonly runtimeMapping = new Map<string, string>();
  private readonly mapping: Record<string, string>;
  private rankingRequest: Promise<RankedCourse[]> | undefined;
  private catalogRequest: Promise<void> | undefined;
  rankings: readonly RankedCourse[] = [];
  constructor(
    private readonly repository: CatalogRepository,
    private readonly storage: SafeStorage,
  ) {
    this.mapping = storage.parse(mappingKey, mapSchema, () => ({}));
    const locations = storage.parse(
      "theCourseBook_ranking_locations_v1",
      locationSchema,
      () => ({}),
    );
    for (const raw of bundled) {
      const course = canonicalize(courseSchema.parse(raw));
      this.records.set(
        course.id,
        courseSchema.parse({ ...course, ...locations[course.id] }),
      );
    }
  }
  all(): Course[] {
    return [...this.records.values()];
  }
  get(id: string): Course | undefined {
    return this.records.get(id);
  }
  restore(records: readonly Course[]): void {
    for (const course of records) this.merge(course);
  }
  customRecords(ids: readonly string[]): Course[] {
    return ids.flatMap((id) => {
      const course = this.get(id);
      return course && !this.bundledIds.has(id) ? [course] : [];
    });
  }
  merge(course: Course): Course {
    const previous = this.records.get(course.id);
    const result = canonicalize(previous ?? course);
    this.records.set(result.id, result);
    return result;
  }
  replace(course: Course): void {
    this.records.set(course.id, canonicalize(course));
  }
  remember(localId: string, dbId: string): void {
    this.mapping[localId] = dbId;
    this.runtimeMapping.set(localId, dbId);
    this.storage.save(mappingKey, this.mapping);
  }
  fromRow(row: CourseRow, localIds: readonly string[] = []): Course {
    const mapped = Object.entries(this.mapping).find(
      ([, dbId]) => dbId === row.id,
    )?.[0];
    const mappedCourse = mapped ? this.get(mapped) : undefined;
    if (mappedCourse) {
      this.runtimeMapping.set(mappedCourse.id, row.id);
      return mappedCourse;
    }
    const matches = localIds.flatMap((id) => {
      const course = this.get(id);
      return course && normalizeName(course.name) === normalizeName(row.name)
        ? [course]
        : [];
    });
    const local = matches.length === 1 ? matches[0] : undefined;
    if (local) {
      const location = cloudLocation(row);
      const result = canonicalize(
        location
          ? {
              ...local,
              location,
              city: row.city ?? "",
              state: row.state ?? "",
              country: row.country ?? "",
              region:
                (row.country ?? "").toUpperCase() === "USA"
                  ? "custom"
                  : "international",
            }
          : local,
      );
      this.records.set(result.id, result);
      this.runtimeMapping.set(result.id, row.id);
      return result;
    }
    const normalized = normalizeName(row.name),
      canonical = canonicalLocations.get(normalized);
    const exact = this.all().filter(
      (course) => normalizeName(course.name) === normalized,
    );
    const alias = this.get(aliases.get(normalized) ?? "");
    const matched = canonical
      ? exact.length === 1
        ? exact[0]
        : exact.find(
            (course) =>
              normalizeName(course.location) === normalizeName(canonical),
          )
      : (alias ??
        (exact.length === 1
          ? exact[0]
          : exact.find(
              (course) =>
                normalizeName(course.location) ===
                normalizeName(cloudLocation(row)),
            )));
    const location =
      canonical ?? (cloudLocation(row) || "Location not specified");
    const country = countryFromLocation(
      location,
      canonical ? "" : (row.country ?? ""),
    );
    const course =
      matched ??
      courseSchema.parse({
        id: canonical ? "canonical-" + normalized : "cloud-" + row.id,
        name: row.name,
        location,
        country,
        city: row.city ?? "",
        state: row.state ?? "",
        region: country === "USA" ? "custom" : "international",
        logo: row.logo_url ?? "",
        website: row.website_url ?? "",
      });
    const result = this.merge(course);
    if (!result.id.startsWith("cloud-") && !result.id.startsWith("custom-"))
      this.remember(result.id, row.id);
    else this.runtimeMapping.set(result.id, row.id);
    return result;
  }
  async loadRankings(): Promise<RankedCourse[]> {
    if (this.rankingRequest) return this.rankingRequest;
    this.rankingRequest = this.fetchRankings().catch((error: unknown) => {
      this.rankingRequest = undefined;
      throw error;
    });
    return this.rankingRequest;
  }
  private async fetchRankings(): Promise<RankedCourse[]> {
    const rows = await this.repository.rankings();
    const courses = await this.repository.courses([
      ...new Set(rows.map((row) => row.course_id)),
    ]);
    const byId = new Map(courses.map((row) => [row.id, row]));
    const rankings = rows.flatMap((row) => {
      const course = byId.get(row.course_id);
      return course
        ? [
            {
              course: this.fromRow(course),
              rank: row.rank,
              type: row.ranking_type,
              scope: row.scope_code,
            },
          ]
        : [];
    });
    this.rankings = rankings;
    return rankings;
  }
  async loadCatalog(): Promise<void> {
    if (this.catalogRequest) return this.catalogRequest;
    this.catalogRequest = this.repository
      .usaCatalog()
      .then((rows) => {
        for (const row of rows) this.fromRow(row);
      })
      .catch((error: unknown) => {
        this.catalogRequest = undefined;
        throw error;
      });
    return this.catalogRequest;
  }
  async rows(ids: readonly string[]): Promise<CourseRow[]> {
    return this.repository.courses(ids);
  }
  resolveSelection(course: Course): Course {
    const mapping = this.storage.parse(
      "theCourseBookApiMappings",
      mapSchema,
      () => ({}),
    );
    return (
      this.get(mapping[course.id] ?? "") ??
      resolveRanked(this.all(), course.name, course.location) ??
      course
    );
  }
  async ensure(course: Course): Promise<string> {
    const runtime = this.runtimeMapping.get(course.id);
    if (runtime) return runtime;
    const isStatic =
      !course.id.startsWith("cloud-") && !course.id.startsWith("custom-");
    const wantedCountry = countryFromLocation(course.location, course.country),
      wantedLocation = normalizeName(course.location);
    const matches = (row: CourseRow) =>
      countryFromLocation(cloudLocation(row), row.country ?? "") ===
        wantedCountry && normalizeName(cloudLocation(row)) === wantedLocation;
    const known = this.mapping[course.id];
    if (isStatic && known) {
      const row = (await this.repository.courses([known]))[0];
      if (
        row &&
        normalizeName(row.name) === normalizeName(course.name) &&
        matches(row)
      ) {
        this.runtimeMapping.set(course.id, known);
        return known;
      }
      Reflect.deleteProperty(this.mapping, course.id);
      this.storage.save(mappingKey, this.mapping);
    }
    const rows = await this.repository.byName(
      isStatic ? course.name : course.name.trim(),
    );
    const candidates = rows.filter(
      (row) =>
        countryFromLocation(cloudLocation(row), row.country ?? "") ===
        wantedCountry,
    );
    const exact = candidates.find(matches);
    const stateMatch = course.state
      ? candidates
          .filter(
            (row) =>
              normalizeName(row.state ?? "") === normalizeName(course.state),
          )
          .sort((a, b) => Number(!!b.city) - Number(!!a.city))[0]
      : undefined;
    const richest = [...candidates].sort(
      (a, b) =>
        Number(!!b.city) +
        Number(!!b.state) -
        (Number(!!a.city) + Number(!!a.state)),
    )[0];
    const match = isStatic ? exact : (exact ?? stateMatch ?? richest);
    const parts = course.location
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
      last = parts.at(-1) ?? "";
    const id =
      match?.id ??
      (await this.repository.insert({
        name: course.name,
        city:
          course.city ||
          (course.state ? null : parts.length > 1 ? (parts[0] ?? null) : null),
        state:
          course.state ||
          (wantedCountry === "USA" && last.length === 2 ? last : null),
        country: wantedCountry,
        logo_url: course.logo || null,
        website_url: course.website || null,
      }));
    this.runtimeMapping.set(course.id, id);
    if (isStatic) this.remember(course.id, id);
    return id;
  }
}
