import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppDependencies } from "../app";
import { requireUser } from "../auth/middleware";
import { toCoursePage } from "../contract/mappers";
import { getCourse } from "../contract/routes";
import type { AppEnv } from "../http/env";
import { coursePage } from "../services/courses";
import { AppError, ErrorCode } from "../services/errors";
import { guarded } from "./guard";

/** A course's page for the member and their friends (decision 2026-11-13). */
export function registerCourseRoutes(app: OpenAPIHono<AppEnv>, deps: AppDependencies): void {
  app.openapi(guarded(getCourse), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    const page = await coursePage(deps.db, user.id, courseId);
    if (!page) throw new AppError(404, ErrorCode.CourseNotFound, "There is no course with that id.");
    return c.json(toCoursePage(page), 200);
  });
}
