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
  FeedSchema,
  FriendRequestsSchema,
  LoggedRoundsSchema,
  LogRoundsRequestSchema,
  MeSchema,
  MemberListSchema,
  MemberRelationshipSchema,
  MemberSearchQuerySchema,
  MemberSearchResultsSchema,
  MembersQuerySchema,
  MembersSchema,
  MovedCourseSchema,
  MoveCourseRequestSchema,
  MyCoursesSchema,
  PageQuerySchema,
  PlayCountSchema,
  ProfileSchema,
  RankingsSchema,
  RoundIdParamsSchema,
  RoundsSchema,
  SearchQuerySchema,
  SearchResultsSchema,
  SetPlayCountRequestSchema,
  TimelineSchema,
  TopListDetailSchema,
  TopListParamsSchema,
  TopListsSchema,
  UsernameParamsSchema,
  WantToPlaySchema,
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
const usernameTaken = failure("Another member holds the Clerk account's username: `username_taken`. Choose a different username.");
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
  responses: { 200: json(MeSchema, "The member."), 401: unauthenticated, 403: forbidden, 409: usernameTaken },
});

export const listMyCourses = createRoute({
  method: "get",
  path: "/v1/me/courses",
  operationId: "listMyCourses",
  tags: ["My List"],
  summary: "The signed-in member's list in personal rank order",
  security: MEMBER,
  responses: { 200: json(MyCoursesSchema, "The list."), 401: unauthenticated, 403: forbidden, 409: usernameTaken },
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
  responses: { 200: json(RoundsSchema, "The rounds."), 400: invalid, 401: unauthenticated, 403: forbidden, 409: usernameTaken },
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
  description: "Searches stored courses by default. Use source=external to explicitly search beyond the catalog. Catalog courses carry their id; other hits carry details to send back when adding the course.",
  security: MEMBER,
  request: { query: SearchQuerySchema },
  responses: {
    200: json(SearchResultsSchema, "An alphabetical page of up to ten hits with the total match count."),
    400: invalid,
    401: unauthenticated,
    403: forbidden,
    409: usernameTaken,
    503: failure("Course discovery is unavailable: `search_unavailable`. Retry later."),
  },
});

export const listMembers = createRoute({
  method: "get",
  path: "/v1/members",
  operationId: "listMembers",
  tags: ["Members"],
  summary: "The member's friends, a page at a time",
  description: "Only accepted friends are listed; pending requests are in `listFriendRequests`.",
  security: MEMBER,
  request: { query: MembersQuerySchema },
  responses: { 200: json(MembersSchema, "One page of members."), 400: invalid, 401: unauthenticated, 403: forbidden, 409: usernameTaken },
});

export const getMemberList = createRoute({
  method: "get",
  path: "/v1/members/{username}",
  operationId: "getMemberList",
  tags: ["Members"],
  summary: "A friend's list (or the member's own), read-only",
  description: "Usernames match case-insensitively. A member who is not a friend is indistinguishable from no member.",
  security: MEMBER,
  request: { params: UsernameParamsSchema },
  responses: {
    200: json(MemberListSchema, "The member and their list, with on-my-list flags for the viewer."),
    401: unauthenticated,
    403: forbidden,
    404: failure("No such member, or not a friend: `member_not_found`."),
    409: usernameTaken,
  },
});

const invalidCursor = failure("Invalid parameters or an unusable `cursor`: `validation_failed`.");
const notVisible = failure("No such member, or not a friend: `member_not_found`.");

export const getMemberProfile = createRoute({
  method: "get",
  path: "/v1/members/{username}/profile",
  operationId: "getMemberProfile",
  tags: ["Members"],
  summary: "A friend's profile (or the member's own)",
  description:
    "Header, stats, Top Four and, for a friend, how their ranking compares with the viewer's. " +
    "A member who is not a friend is indistinguishable from no member.",
  security: MEMBER,
  request: { params: UsernameParamsSchema },
  responses: { 200: json(ProfileSchema, "The profile."), 401: unauthenticated, 403: forbidden, 404: notVisible, 409: usernameTaken },
});

export const listMemberRounds = createRoute({
  method: "get",
  path: "/v1/members/{username}/rounds",
  operationId: "listMemberRounds",
  tags: ["Members"],
  summary: "A friend's timeline of rounds (or the member's own), a page at a time",
  description: "Newest played first; undated rounds last. Dates and courses only.",
  security: MEMBER,
  request: { params: UsernameParamsSchema, query: PageQuerySchema },
  responses: { 200: json(TimelineSchema, "One page of rounds."), 400: invalidCursor, 401: unauthenticated, 403: forbidden, 404: notVisible, 409: usernameTaken },
});

export const listWantToPlay = createRoute({
  method: "get",
  path: "/v1/members/{username}/want-to-play",
  operationId: "listWantToPlay",
  tags: ["Members"],
  summary: "A friend's Want to play list (or the member's own)",
  description: "Newest first. A member who is not a friend is indistinguishable from no member.",
  security: MEMBER,
  request: { params: UsernameParamsSchema },
  responses: { 200: json(WantToPlaySchema, "The Want to play list."), 401: unauthenticated, 403: forbidden, 404: notVisible, 409: usernameTaken },
});

export const listTopLists = createRoute({
  method: "get",
  path: "/v1/top-lists",
  operationId: "listTopLists",
  tags: ["Top Lists"],
  summary: "Every published list with the member's progress and their friends'",
  security: MEMBER,
  responses: { 200: json(TopListsSchema, "Every list, national first."), 401: unauthenticated, 403: forbidden, 409: usernameTaken },
});

export const getTopList = createRoute({
  method: "get",
  path: "/v1/top-lists/{type}/{scope}",
  operationId: "getTopList",
  tags: ["Top Lists"],
  summary: "One published list as a checklist for the member and their friends",
  description: "Every course in rank order with the member's rounds, Want to play, and the friends who played it.",
  security: MEMBER,
  request: { params: TopListParamsSchema },
  responses: {
    200: json(TopListDetailSchema, "The list."),
    401: unauthenticated,
    403: forbidden,
    404: failure("No published list with that type and scope: `top_list_not_found`."),
    409: usernameTaken,
  },
});

export const getFeed = createRoute({
  method: "get",
  path: "/v1/feed",
  operationId: "getFeed",
  tags: ["Feed"],
  summary: "What the member's friends did, newest first, a page at a time",
  description: "Rounds logged long after they were played are collapsed into one backfill item per friend and day.",
  security: MEMBER,
  request: { query: PageQuerySchema },
  responses: { 200: json(FeedSchema, "One page of the feed."), 400: invalidCursor, 401: unauthenticated, 403: forbidden, 409: usernameTaken },
});

export const searchMembers = createRoute({
  method: "get",
  path: "/v1/member-search",
  operationId: "searchMembers",
  tags: ["Members"],
  summary: "Find members by username to send a friend request",
  description: "Returns usernames, display names and the viewer's relationship; never a list.",
  security: MEMBER,
  request: { query: MemberSearchQuerySchema },
  responses: {
    200: json(MemberSearchResultsSchema, "Matching members."),
    400: invalid,
    401: unauthenticated,
    403: forbidden,
    409: usernameTaken,
  },
});

export const listFriendRequests = createRoute({
  method: "get",
  path: "/v1/me/friend-requests",
  operationId: "listFriendRequests",
  tags: ["Members"],
  summary: "The member's pending friend requests, incoming and outgoing",
  security: MEMBER,
  responses: { 200: json(FriendRequestsSchema, "Pending requests."), 401: unauthenticated, 403: forbidden, 409: usernameTaken },
});

export const befriendMember = createRoute({
  method: "put",
  path: "/v1/me/friends/{username}",
  operationId: "befriendMember",
  tags: ["Members"],
  summary: "Send a friend request, or accept one from that member",
  description:
    "Idempotent. If the other member already asked, this accepts and the two are friends; otherwise it sends a request. " +
    "Usernames match case-insensitively.",
  security: MEMBER,
  request: { params: UsernameParamsSchema },
  responses: {
    200: json(MemberRelationshipSchema, "The relationship afterwards: requested or friends."),
    400: failure("The member's own username: `validation_failed`."),
    401: unauthenticated,
    403: forbidden,
    404: failure("No such member: `member_not_found`."),
    409: usernameTaken,
  },
});

export const removeFriend = createRoute({
  method: "delete",
  path: "/v1/me/friends/{username}",
  operationId: "removeFriend",
  tags: ["Members"],
  summary: "Remove a friend, cancel a request, or decline one",
  security: MEMBER,
  request: { params: UsernameParamsSchema },
  responses: {
    204: { description: "Nothing is left between the two members." },
    401: unauthenticated,
    403: forbidden,
    404: failure("No such member: `member_not_found`; nothing between the two: `friendship_not_found`."),
    409: usernameTaken,
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
    409: usernameTaken,
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
  responses: { 200: json(AddedCourseSchema, "The course and the updated list."), 400: invalidBody, 401: unauthenticated, 403: forbidden, 409: usernameTaken },
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
    409: usernameTaken,
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
    409: usernameTaken,
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
    409: usernameTaken,
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
    409: usernameTaken,
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
    409: usernameTaken,
  },
});

export const addWantToPlay = createRoute({
  method: "put",
  path: "/v1/me/want-to-play/{courseId}",
  operationId: "addWantToPlay",
  tags: ["Want to Play"],
  summary: "Put a catalog course on the Want to play list",
  description:
    "Played courses are allowed (\"play it again\"). Adding it again keeps the original date, so retrying is safe. " +
    "Logging a round at the course takes it off the list.",
  security: MEMBER,
  request: { params: CourseIdParamsSchema },
  responses: {
    200: json(WantToPlaySchema, "The member's Want to play list afterwards."),
    400: invalid,
    401: unauthenticated,
    403: forbidden,
    404: failure("No such catalog course: `course_not_found`."),
    409: usernameTaken,
  },
});

export const removeWantToPlay = createRoute({
  method: "delete",
  path: "/v1/me/want-to-play/{courseId}",
  operationId: "removeWantToPlay",
  tags: ["Want to Play"],
  summary: "Take a course off the Want to play list",
  description: "Removing a course that is not on the list changes nothing, so retrying is safe.",
  security: MEMBER,
  request: { params: CourseIdParamsSchema },
  responses: {
    200: json(WantToPlaySchema, "The member's Want to play list afterwards."),
    400: invalid,
    401: unauthenticated,
    403: forbidden,
    409: usernameTaken,
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
    "they added stay in the shared catalog. Safe to retry: after a 502, call it again with the same token. Works even " +
    "for an account that other operations refuse with 403 `username_invalid` or 409 `username_taken`.",
  security: MEMBER,
  responses: {
    204: { description: "The account is deleted; sign the member out." },
    401: unauthenticated,
    403: failure("Not returned since account deletion stopped provisioning the member; kept so existing clients still compile."),
    502: failure("The data is deleted but the sign-in account could not be: `account_deletion_incomplete`. Retry."),
  },
});
