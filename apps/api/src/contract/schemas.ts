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
        "Stable machine-readable code. Current values: bad_request, validation_failed, us_state_required, " +
        "unauthenticated, account_deleted, username_invalid, not_found, course_not_found, not_on_list, " +
        "round_not_found, member_not_found, payload_too_large, unsupported_media_type, " +
        "account_deletion_incomplete, search_unavailable, internal. New codes may appear; treat unknown codes by HTTP status.",
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

const listAfterChange = z
  .array(MyCourseSchema)
  .openapi({ description: "The member's whole list after the change, read in the same transaction." });

export const AddedToListSchema = z
  .object({ added: z.boolean().openapi({ description: "False when the course was already on the list." }), courses: listAfterChange })
  .openapi("AddedToList");

export const AddedCourseSchema = z
  .object({ courseId: z.uuid(), rank, courses: listAfterChange })
  .openapi("AddedCourse");

export const LoggedRoundsSchema = z
  .object({ added: z.number().int().min(1).openapi({ description: "Rounds logged." }), courses: listAfterChange })
  .openapi("LoggedRounds");

export const MovedCourseSchema = z
  .object({ rank, courses: listAfterChange })
  .openapi("MovedCourse");

export const PlayCountSchema = z
  .object({
    count: z.number().int().min(0),
    removed: z.boolean().openapi({ description: "True when a count of zero removed the course from the list." }),
    courses: listAfterChange,
  })
  .openapi("PlayCount");

export const DeletedRoundSchema = z
  .object({
    courseId: z.uuid(),
    removedCourse: z.boolean().openapi({ description: "True when it was the course's last round, which removes the course." }),
    courses: listAfterChange,
  })
  .openapi("DeletedRound");

const playedOn = z.iso
  .date()
  .nullish()
  .openapi({ description: "Date played (YYYY-MM-DD) in the member's time zone. The server's date (UTC) when omitted, so clients should send it." });

const quantity = z
  .number()
  .int()
  .min(1, "Log at least one round.")
  .max(100, "Log at most 100 rounds at a time.")
  .nullish()
  .openapi({ description: "Rounds to log; 1 when omitted." });

export const CourseDetailsRequestSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a course name."),
    location: z.string().trim().nullish(),
    city: z.string().trim().nullish(),
    state: z.string().trim().nullish().openapi({ description: "Required, as a two-letter code, for U.S. courses whose location does not name the state." }),
    country: z.string().trim().min(1, "Select a country."),
    logoUrl: z.string().trim().nullish(),
    websiteUrl: z.string().trim().nullish(),
  })
  .openapi("CourseDetailsRequest");

export const CourseSourceSchema = z
  .enum(["search", "manual"])
  .openapi("CourseSource", { description: "`search`: a course search hit; `manual`: a course the member typed in (shared with everyone as a custom course)." });

export const AddCourseRequestSchema = z
  .object({
    course: CourseDetailsRequestSchema,
    source: CourseSourceSchema,
    rank: z.number().int().min(1).nullish().openapi({ description: "Position for a course not yet on the list; the bottom when omitted. A course already on the list keeps its rank." }),
    quantity,
    playedOn,
  })
  .openapi("AddCourseRequest");

export const AddToListRequestSchema = z.object({ playedOn }).openapi("AddToListRequest");

export const LogRoundsRequestSchema = z.object({ quantity, playedOn }).openapi("LogRoundsRequest");

export const MoveCourseRequestSchema = z
  .object({ rank: rank.openapi({ description: "Target position; past the end means the bottom." }) })
  .openapi("MoveCourseRequest");

export const SetPlayCountRequestSchema = z
  .object({ count: z.number().int().min(0).max(1000).openapi({ description: "Zero removes the course from the list. Lowering deletes the oldest rounds." }) })
  .openapi("SetPlayCountRequest");

export const RoundIdParamsSchema = z.object({
  roundId: z.uuid().openapi({ param: { name: "roundId", in: "path" } }),
});

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
export type AddCourseRequest = z.infer<typeof AddCourseRequestSchema>;
