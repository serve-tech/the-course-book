import { z } from "@hono/zod-openapi";

/**
 * Named schemas of the public API contract (`contract/openapi.json`).
 *
 * Swift and Kotlin clients are generated from this contract, so it follows
 * the rules in .planning/research/2026-09-25-api-split-spikes.md:
 * - every object has a name via `.openapi("Name")`; no inline nested objects;
 * - response fields are always present, `.nullable()` when empty, never
 *   optional and never defaulted;
 * - request fields that are not mandatory are `.nullish()`; handlers apply
 *   defaults;
 * - values that may gain new members (error codes, ranking list types) are
 *   documented strings, not enums.
 * Changes are additive only: never rename, retype or remove a field.
 */

const rank = z.number().int().min(1);
const optionalRank = z.number().int().min(1).nullable();

export const FieldErrorSchema = z
  .object({
    path: z.string().openapi({ description: "Dotted path of the invalid input, e.g. `q` or `course.name`." }),
    message: z.string(),
  })
  .openapi("FieldError");

export const ApiErrorBodySchema = z
  .object({
    code: z.string().openapi({
      description:
        "Stable machine-readable code. Current values: bad_request, validation_failed, unauthenticated, " +
        "username_invalid, not_found, course_not_found, not_on_list, round_not_found, member_not_found, " +
        "payload_too_large, unsupported_media_type, search_unavailable, internal. New codes may appear; " +
        "treat unknown codes by HTTP status.",
      example: "not_on_list",
    }),
    message: z.string().openapi({ description: "Explanation suitable to show to the member." }),
    requestId: z.string().openapi({ description: "Correlates the failure with server logs." }),
    fields: z.array(FieldErrorSchema).nullable().openapi({ description: "Per-field problems for validation_failed; otherwise null." }),
  })
  .openapi("ApiErrorBody");

export const ApiErrorSchema = z.object({ error: ApiErrorBodySchema }).openapi("ApiError");

export const CourseRanksSchema = z
  .object({
    world: optionalRank,
    usa: optionalRank,
    usaPublic: optionalRank,
    state: optionalRank.openapi({ description: "Rank on the Best-in-State list of the course's own state." }),
  })
  .openapi("CourseRanks");

export const CourseSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    location: z.string().nullable().openapi({ description: "Display location, e.g. `Arcadia, MI, USA`; null when unknown." }),
    city: z.string().nullable(),
    state: z.string().nullable().openapi({ description: "Two-letter state code for US courses." }),
    country: z.string(),
    logoUrl: z.string().nullable(),
    websiteUrl: z.string().nullable(),
    ranks: CourseRanksSchema,
  })
  .openapi("Course");

export const CourseDetailsSchema = z
  .object({
    name: z.string(),
    location: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    country: z.string(),
    logoUrl: z.string().nullable(),
    websiteUrl: z.string().nullable(),
  })
  .openapi("CourseDetails", { description: "A course described by its details, e.g. a search result not yet in the catalog." });

export const MeSchema = z
  .object({ username: z.string(), displayName: z.string() })
  .openapi("Me");

export const MyCourseSchema = z
  .object({ course: CourseSchema, rank, played: z.number().int().min(0) })
  .openapi("MyCourse");

export const MyCoursesSchema = z
  .object({ courses: z.array(MyCourseSchema).openapi({ description: "The member's list in personal rank order." }) })
  .openapi("MyCourses");

export const RoundSchema = z
  .object({ id: z.uuid(), playedOn: z.iso.date() })
  .openapi("Round");

export const RoundsSchema = z
  .object({ rounds: z.array(RoundSchema).openapi({ description: "Newest first." }) })
  .openapi("Rounds");

export const RankingEntrySchema = z
  .object({
    course: CourseSchema,
    rank,
    type: z.string().openapi({ description: "Published list: world, usa, usa_public or state. New lists may appear." }),
    scope: z.string().openapi({ description: "List scope, e.g. WORLD, USA or a state code." }),
  })
  .openapi("RankingEntry");

export const RankingsSchema = z
  .object({ entries: z.array(RankingEntrySchema) })
  .openapi("Rankings");

export const SearchHitSchema = z
  .object({
    courseId: z.uuid().nullable().openapi({ description: "Catalog course id when the hit is already in the catalog; null otherwise." }),
    course: CourseDetailsSchema,
    ranks: CourseRanksSchema,
  })
  .openapi("SearchHit");

export const SearchResultsSchema = z
  .object({ results: z.array(SearchHitSchema).openapi({ description: "At most 10, best match first." }) })
  .openapi("SearchResults");

export const MemberSchema = z
  .object({ username: z.string(), displayName: z.string() })
  .openapi("Member", { description: "Another member's public projection; never an email or an id." });

export const MembersSchema = z
  .object({
    members: z.array(MemberSchema),
    nextCursor: z.string().nullable().openapi({ description: "Pass as `cursor` for the next page; null on the last page." }),
  })
  .openapi("Members");

export const MemberCourseSchema = z
  .object({ course: CourseSchema, rank, onMyList: z.boolean() })
  .openapi("MemberCourse");

export const MemberListSchema = z
  .object({ member: MemberSchema, courses: z.array(MemberCourseSchema) })
  .openapi("MemberList");

export const MinimumVersionsSchema = z
  .object({ ios: z.string(), android: z.string() })
  .openapi("MinimumVersions", { description: "Oldest app versions the API still supports; older builds must update." });

export const ClientConfigSchema = z
  .object({
    minimumVersions: MinimumVersionsSchema,
    privacyUrl: z.url(),
    accountDeletionUrl: z.url(),
  })
  .openapi("ClientConfig");

export const HealthSchema = z.object({ ok: z.boolean() }).openapi("Health");

export const CourseIdParamsSchema = z.object({
  courseId: z.uuid().openapi({ param: { name: "courseId", in: "path" } }),
});

export const UsernameParamsSchema = z.object({
  username: z.string().min(1).openapi({ param: { name: "username", in: "path" } }),
});

export const SearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, "Enter at least two characters.")
    .openapi({ param: { name: "q", in: "query" }, description: "Course name, at least two characters." }),
});

export const MembersQuerySchema = z.object({
  cursor: z.string().nullish().openapi({ param: { name: "cursor", in: "query" } }),
  limit: z.coerce.number().int().min(1).max(200).nullish().openapi({ param: { name: "limit", in: "query" }, description: "Defaults to 50." }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ContractCourse = z.infer<typeof CourseSchema>;
export type CourseDetails = z.infer<typeof CourseDetailsSchema>;
export type CourseRanks = z.infer<typeof CourseRanksSchema>;
export type ClientConfig = z.infer<typeof ClientConfigSchema>;
