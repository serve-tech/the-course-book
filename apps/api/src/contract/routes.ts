import { createRoute, type z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  ClientConfigSchema,
  CourseIdParamsSchema,
  MeSchema,
  MemberListSchema,
  MembersQuerySchema,
  MembersSchema,
  MyCoursesSchema,
  RankingsSchema,
  RoundsSchema,
  SearchQuerySchema,
  SearchResultsSchema,
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
const unauthenticated = failure("No valid session: `unauthenticated`.");
const forbidden = failure("The Clerk account cannot use the app: `username_invalid`.");
const invalid = failure("Invalid parameters: `validation_failed`.");

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
