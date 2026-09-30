import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppDependencies } from "../app";
import { requireUser } from "../auth/middleware";
import { toWantToPlay } from "../contract/mappers";
import { addWantToPlay, listWantToPlay, removeWantToPlay } from "../contract/routes";
import type { AppEnv } from "../http/env";
import { guarded } from "./guard";
import { AppError, ErrorCode } from "../services/errors";
import * as wantToPlay from "../services/want-to-play";

/**
 * Want to play lists: the member's own, which they change, and their
 * friends', which they read (decision 2026-09-29, social redesign).
 */
export function registerWantToPlayRoutes(app: OpenAPIHono<AppEnv>, deps: AppDependencies): void {
  app.openapi(guarded(listWantToPlay), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { username } = c.req.valid("param");
    const entries = await wantToPlay.memberWantToPlay(deps.db, user.id, username);
    if (!entries) throw new AppError(404, ErrorCode.MemberNotFound, "No member with that username among your friends.");
    return c.json(toWantToPlay(entries), 200);
  });

  app.openapi(guarded(addWantToPlay), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    return c.json(toWantToPlay(await wantToPlay.addWantToPlay(deps.db, user.id, courseId)), 200);
  });

  app.openapi(guarded(removeWantToPlay), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    return c.json(toWantToPlay(await wantToPlay.removeWantToPlay(deps.db, user.id, courseId)), 200);
  });
}
