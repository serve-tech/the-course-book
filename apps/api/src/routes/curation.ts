import type { OpenAPIHono } from "@hono/zod-openapi";
import { MemberRole } from "@coursebook/domain/curation/types";
import type { AppDependencies } from "../app";
import { requireUser } from "../auth/middleware";
import { toContractCourse } from "../contract/mappers";
import { listCurationCourses, listMemberRoles, removeCoursePhoto, searchCommonsPhotos, setCoursePhoto, setMemberRole } from "../contract/routes";
import type { AppEnv } from "../http/env";
import { curationCourses, memberRoles, removeCoursePhoto as removePhoto, searchCommons, setCommonsPhoto, setMemberRole as setRole } from "../services/curation";
import { guarded } from "./guard";

/** Course photo curation and the curator role (decision 2026-11-13). */
export function registerCurationRoutes(app: OpenAPIHono<AppEnv>, deps: AppDependencies): void {
  app.openapi(guarded(listCurationCourses), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const courses = await curationCourses(deps.db, user.id);
    return c.json({ courses: courses.map((entry) => ({ course: toContractCourse(entry.course), members: entry.members })) }, 200);
  });

  app.openapi(guarded(searchCommonsPhotos), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { q } = c.req.valid("query");
    return c.json({ candidates: await searchCommons(deps.db, deps.commons, user.id, q) }, 200);
  });

  app.openapi(guarded(setCoursePhoto), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    const { commonsFile } = c.req.valid("json");
    return c.json(toContractCourse(await setCommonsPhoto(deps.db, deps.commons, user.id, courseId, commonsFile)), 200);
  });

  app.openapi(guarded(removeCoursePhoto), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    return c.json(toContractCourse(await removePhoto(deps.db, user.id, courseId)), 200);
  });

  app.openapi(guarded(listMemberRoles), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    return c.json({ members: await memberRoles(deps.db, user.id) }, 200);
  });

  app.openapi(guarded(setMemberRole), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { username } = c.req.valid("param");
    const { role } = c.req.valid("json");
    return c.json(await setRole(deps.db, user.id, username, role === "curator" ? MemberRole.Curator : MemberRole.Member), 200);
  });
}
