import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppDependencies } from "../app";
import { requireUser } from "../auth/middleware";
import { toMyCourse, toRound } from "../contract/mappers";
import { getMe, listMyCourseRounds, listMyCourses } from "../contract/routes";
import type { AppEnv } from "../http/env";
import { personalList, roundHistory } from "../services/journal";

/** The signed-in member and their own list. */
export function registerAccountRoutes(app: OpenAPIHono<AppEnv>, deps: AppDependencies): void {
  app.openapi(getMe, async (c) => {
    const user = await requireUser(c, deps.provisioner);
    return c.json({ username: user.username, displayName: user.displayName }, 200);
  });

  app.openapi(listMyCourses, async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const entries = await personalList(deps.db, user.id);
    return c.json({ courses: entries.map(toMyCourse) }, 200);
  });

  app.openapi(listMyCourseRounds, async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    const rounds = await roundHistory(deps.db, user.id, courseId);
    return c.json({ rounds: rounds.map(toRound) }, 200);
  });
}
