import type { OpenAPIHono } from "@hono/zod-openapi";
import { MemberRole } from "@coursebook/domain/curation/types";
import type { Context, MiddlewareHandler } from "hono";
import type { AppDependencies, Logger } from "../app";
import { requireUser } from "../auth/middleware";
import { toContractCourse } from "../contract/mappers";
import {
  getPhotoUploadSettings,
  listCurationCourses,
  listMemberRoles,
  removeCoursePhoto,
  searchCommonsPhotos,
  setCoursePhoto,
  setMemberRole,
  uploadCoursePhoto,
} from "../contract/routes";
import { UPLOAD_CONTENT_TYPES, UPLOAD_LIMITS } from "../domain/stored-photo";
import type { AppEnv } from "../http/env";
import { loggableError } from "../http/loggable-error";
import {
  curationCourses,
  memberRoles,
  removeCoursePhoto as removePhoto,
  requireCurator,
  searchCommons,
  setCommonsPhoto,
  setMemberRole as setRole,
  uploadCoursePhoto as uploadPhoto,
  type LeftoverLog,
} from "../services/curation";
import { AppError, ErrorCode } from "../services/errors";
import { tooManyBytesError } from "../services/photo-images";
import { guarded } from "./guard";

/** Course photo curation and the curator role (decisions 2026-11-13 and 2026-11-15). */
export function registerCurationRoutes(app: OpenAPIHono<AppEnv>, deps: AppDependencies, logger: Logger): void {
  const storage = deps.photos ?? null;
  const limits = storage?.limits ?? UPLOAD_LIMITS;

  /** Stored files a request left behind go to the error log with its request id. */
  const leftovers =
    (c: Context<AppEnv>): LeftoverLog =>
    (message, detail, error) => {
      const fields = { requestId: c.get("requestId"), ...detail };
      if (error === undefined) logger.warn(message, fields);
      else logger.error(message, loggableError(error), fields);
    };

  /**
   * Refuse an upload before its file is read: when uploads are off, or the
   * member isn't a curator. The service checks the role again in its
   * transaction.
   */
  const uploadGate: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (!storage) throw new AppError(503, ErrorCode.PhotoUploadsOff, "Photo uploads aren't switched on yet. Pick a photo from Wikimedia Commons instead.");
    const user = await requireUser(c, deps.provisioner);
    await requireCurator(deps.db, user.id);
    await next();
  };

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
    return c.json(toContractCourse(await setCommonsPhoto(deps.db, deps.commons, storage, leftovers(c), user.id, courseId, commonsFile)), 200);
  });

  app.openapi(guarded(removeCoursePhoto), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    return c.json(toContractCourse(await removePhoto(deps.db, storage?.store ?? null, leftovers(c), user.id, courseId)), 200);
  });

  app.openapi(guarded(getPhotoUploadSettings), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    await requireCurator(deps.db, user.id);
    return c.json(
      { enabled: storage !== null, maxBytes: limits.maxBytes, maxPixels: limits.maxPixels, minWidth: limits.minWidth, contentTypes: [...UPLOAD_CONTENT_TYPES] },
      200,
    );
  });

  app.openapi(guarded(uploadCoursePhoto, uploadGate), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    const form = c.req.valid("form");
    if (form.photo.size > limits.maxBytes) throw tooManyBytesError(limits);
    const course = await uploadPhoto(deps.db, storage, leftovers(c), user.id, courseId, {
      image: new Uint8Array(await form.photo.arrayBuffer()),
      credit: form.credit,
      license: form.license,
      licenseUrl: form.licenseUrl ?? null,
      sourceUrl: form.sourceUrl ?? null,
    });
    return c.json(toContractCourse(course), 200);
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
