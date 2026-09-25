import { createRoute, type z } from "@hono/zod-openapi";
import {
  AddCourseRequestSchema,
  AddedCourseSchema,
  AddedToListSchema,
  AddToListRequestSchema,
  ApiErrorSchema,
  ClientConfigSchema,
  CourseIdParamsSchema,
  DeletedRoundSchema,
  LoggedRoundsSchema,
  LogRoundsRequestSchema,
  MeSchema,
  MemberListSchema,
  MembersQuerySchema,
  MembersSchema,
  MovedCourseSchema,
  MoveCourseRequestSchema,
  MyCoursesSchema,
  PlayCountSchema,
  RankingsSchema,
  RoundIdParamsSchema,
  RoundsSchema,
  SearchQuerySchema,
  SearchResultsSchema,
  SetPlayCountRequestSchema,
  UsernameParamsSchema,
} from "./schemas";

/**
 * Operation definitions of API v1: paths, parameters, responses and
 * security, with no handler code. Handlers in `src/routes/` attach to these,
 * and `document.ts` publishes them as `contract/openapi.json`.
 *
 * `operationId`s become method names in the generated Swift and Kotlin
 * clients; never rename one.
 */

/** Security requirement for operations that need a signed-in member. */
export const MEMBER = [{ ClerkSession: [] }];
/** Explicitly public operations. */
const PUBLIC: typeof MEMBER = [];

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});
const failure = (description: string) => json(ApiErrorSchema, description);
const unauthenticated = failure("No valid session: `unauthenticated`, or `account_deleted` after the account was deleted.");
const forbidden = failure("The Clerk account cannot use the app: `username_invalid`.");
const invalid = failure("Invalid parameters: `validation_failed`.");
const invalidBody = failure(
  "Invalid body: `validation_failed`, `us_state_required`, or `bad_request` for unreadable JSON. " +
    "Also 413 `payload_too_large` above 32 KB and 415 `unsupported_media_type` without Content-Type: application/json.",
);
const jsonBody = <T extends z.ZodType>(schema: T) => ({
  body: { required: true, content: { "application/json": { schema } } },
});

export const getMe = createRoute({
  method: "get",
  path: "/v1/me",
  operationId: "getMe",
  tags: ["Account"],
  summary: "The signed-in member",
  security: MEMBER,
  responses: { 200: json(MeSchema, "The member."), 401: unauthenticated, 403: forbidden },
});

export const listMyCourses = createRoute({
  method: "get",
  path: "/v1/me/courses",
  operationId: "listMyCourses",
  tags: ["My List"],
  summary: "The signed-in member's list in personal rank order",
  security: MEMBER,
  responses: { 200: json(MyCoursesSchema, "The list."), 401: unauthenticated, 403: forbidden },
});

export const listMyCourseRounds = createRoute({
  method: "get",
  path: "/v1/me/courses/{courseId}/rounds",
  operationId: "listMyCourseRounds",
  tags: ["My List"],
  summary: "Rounds the member logged at one course, newest first",
  description: "A course that is not on the member's list has no rounds.",
  security: MEMBER,
  request: { params: CourseIdParamsSchema },
  responses: { 200: json(RoundsSchema, "The rounds."), 400: invalid, 401: unauthenticated, 403: forbidden },
});

export const listRankings = createRoute({
  method: "get",
  path: "/v1/rankings",
  operationId: "listRankings",
  tags: ["Catalog"],
  summary: "Every published ranking entry",
  description:
    "Public and cacheable: responses carry an ETag; send it as If-None-Match to receive 304 when nothing changed. " +
    "Send no Authorization header so shared caches can store it.",
  security: PUBLIC,
  responses: {
    200: json(RankingsSchema, "All entries of all published lists."),
    304: { description: "Not modified since the ETag sent in If-None-Match." },
  },
});

export const searchCourses = createRoute({
  method: "get",
  path: "/v1/course-search",
  operationId: "searchCourses",
  tags: ["Catalog"],
  summary: "Find courses by name",
  description: "Catalog courses carry their id; other hits carry details to send back when adding the course.",
  security: MEMBER,
  request: { query: SearchQuerySchema },
  responses: {
    200: json(SearchResultsSchema, "Up to ten hits, best first."),
    400: invalid,
    401: unauthenticated,
    403: forbidden,
    503: failure("Course discovery is unavailable: `search_unavailable`. Retry later."),
  },
});

export const listMembers = createRoute({
  method: "get",
  path: "/v1/members",
  operationId: "listMembers",
  tags: ["Members"],
  summary: "The member directory, a page at a time",
  security: MEMBER,
  request: { query: MembersQuerySchema },
  responses: { 200: json(MembersSchema, "One page of members."), 400: invalid, 401: unauthenticated, 403: forbidden },
});

export const getMemberList = createRoute({
  method: "get",
  path: "/v1/members/{username}",
  operationId: "getMemberList",
  tags: ["Members"],
  summary: "Another member's list, read-only",
  description: "Usernames match case-insensitively.",
  security: MEMBER,
  request: { params: UsernameParamsSchema },
  responses: {
    200: json(MemberListSchema, "The member and their list, with on-my-list flags for the viewer."),
    401: unauthenticated,
    403: forbidden,
    404: failure("No such member: `member_not_found`."),
  },
});

export const getClientConfig = createRoute({
  method: "get",
  path: "/v1/client-config",
  operationId: "getClientConfig",
  tags: ["Clients"],
  summary: "Settings every client reads at launch",
  description: "Apps older than the minimum version must ask the member to update.",
  security: PUBLIC,
  responses: { 200: json(ClientConfigSchema, "Client settings.") },
});

export const addToList = createRoute({
  method: "put",
  path: "/v1/me/courses/{courseId}",
  operationId: "addToList",
  tags: ["My List"],
  summary: "Put a catalog course on the list",
  description:
    "Adds the course at the bottom and logs one round when it has none. Repeating it changes nothing, so retrying is safe.",
  security: MEMBER,
  request: { params: CourseIdParamsSchema, ...jsonBody(AddToListRequestSchema) },
  responses: {
    200: json(AddedToListSchema, "The updated list."),
    400: invalidBody,
    401: unauthenticated,
    403: forbidden,
    404: failure("No such catalog course: `course_not_found`."),
  },
});

export const addCourse = createRoute({
  method: "post",
  path: "/v1/me/courses",
  operationId: "addCourse",
  tags: ["My List"],
  summary: "Add a course described by its details and log rounds",
  description:
    "For search hits without a catalog id and courses typed in by the member. The course is matched against the " +
    "catalog or created, placed at `rank` if new to the list, and `quantity` rounds are logged. Not idempotent: " +
    "retrying after a lost response logs the rounds again.",
  security: MEMBER,
  request: jsonBody(AddCourseRequestSchema),
  responses: { 200: json(AddedCourseSchema, "The course and the updated list."), 400: invalidBody, 401: unauthenticated, 403: forbidden },
});

export const logRounds = createRoute({
  method: "post",
  path: "/v1/me/courses/{courseId}/rounds",
  operationId: "logRounds",
  tags: ["My List"],
  summary: "Log rounds at a catalog course",
  description: "Adds the course at the bottom of the list if needed. Not idempotent.",
  security: MEMBER,
  request: { params: CourseIdParamsSchema, ...jsonBody(LogRoundsRequestSchema) },
  responses: {
    200: json(LoggedRoundsSchema, "The updated list."),
    400: invalidBody,
    401: unauthenticated,
    403: forbidden,
    404: failure("No such catalog course: `course_not_found`."),
  },
});

export const moveCourse = createRoute({
  method: "put",
  path: "/v1/me/courses/{courseId}/rank",
  operationId: "moveCourse",
  tags: ["My List"],
  summary: "Move a course to a position on the list",
  description: "The whole list is renumbered, including courses a client has filtered out.",
  security: MEMBER,
  request: { params: CourseIdParamsSchema, ...jsonBody(MoveCourseRequestSchema) },
  responses: {
    200: json(MovedCourseSchema, "The course's new rank and the updated list."),
    400: invalidBody,
    401: unauthenticated,
    403: forbidden,
    404: failure("The course is not on the list: `not_on_list`."),
  },
});

export const setPlayCount = createRoute({
  method: "put",
  path: "/v1/me/courses/{courseId}/play-count",
  operationId: "setPlayCount",
  tags: ["My List"],
  summary: "Set how many rounds a course has",
  description: "Lowering deletes the oldest rounds; raising logs rounds dated today; zero removes the course.",
  security: MEMBER,
  request: { params: CourseIdParamsSchema, ...jsonBody(SetPlayCountRequestSchema) },
  responses: {
    200: json(PlayCountSchema, "The count and the updated list."),
    400: invalidBody,
    401: unauthenticated,
    403: forbidden,
    404: failure("The course is not on the list: `not_on_list`."),
  },
});

export const removeCourse = createRoute({
  method: "delete",
  path: "/v1/me/courses/{courseId}",
  operationId: "removeCourse",
  tags: ["My List"],
  summary: "Take a course off the list with all its rounds",
  description: "A 404 on retry means the course is already gone.",
  security: MEMBER,
  request: { params: CourseIdParamsSchema },
  responses: {
    200: json(MyCoursesSchema, "The updated list."),
    400: invalid,
    401: unauthenticated,
    403: forbidden,
    404: failure("The course is not on the list: `not_on_list`."),
  },
});

export const deleteRound = createRoute({
  method: "delete",
  path: "/v1/me/rounds/{roundId}",
  operationId: "deleteRound",
  tags: ["My List"],
  summary: "Delete one round",
  description: "Deleting a course's last round takes the course off the list. A 404 on retry means the round is already gone.",
  security: MEMBER,
  request: { params: RoundIdParamsSchema },
  responses: {
    200: json(DeletedRoundSchema, "The updated list."),
    400: invalid,
    401: unauthenticated,
    403: forbidden,
    404: failure("No such round: `round_not_found`."),
  },
});

export const deleteMe = createRoute({
  method: "delete",
  path: "/v1/me",
  operationId: "deleteMe",
  tags: ["Account"],
  summary: "Delete the member's account",
  description:
    "Deletes the member's list and rounds, removes their name and email, and deletes the sign-in account. Courses " +
    "they added stay in the shared catalog. Safe to retry: after a 502, call it again with the same token.",
  security: MEMBER,
  responses: {
    204: { description: "The account is deleted; sign the member out." },
    401: unauthenticated,
    403: forbidden,
    502: failure("The data is deleted but the sign-in account could not be: `account_deletion_incomplete`. Retry."),
  },
});
