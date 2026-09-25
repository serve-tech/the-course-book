/**
 * The server-rendered web app's only doorway to `@coursebook/api`.
 *
 * Until the web app becomes a client of the JSON API, routes still call the
 * services in-process. Everything outside `app/server` imports them from
 * here, and the `.server` suffix makes the build fail if a browser module
 * reaches this file. Delete it once no route calls a service directly.
 */
export { clerkEnv } from "@coursebook/api/services/env";
export { AppError } from "@coursebook/api/services/errors";
export {
  courseInputSchema,
  publishedRankings,
  type CourseInput,
} from "@coursebook/api/services/catalog";
export {
  addCustomCourse,
  addFromFriend,
  addFromRankings,
  deleteCourse,
  deleteRound,
  listSummary,
  logRounds,
  moveCourse,
  personalList,
  roundHistory,
  setCount,
} from "@coursebook/api/services/journal";
export { memberList, members } from "@coursebook/api/services/friends";
export { checkDatabase } from "@coursebook/api/services/health";
export { searchCourses } from "@coursebook/api/services/search";
