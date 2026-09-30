import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppDependencies } from "../app";
import { requireUser } from "../auth/middleware";
import { toTopListDetail, toTopListProgress } from "../contract/mappers";
import { getTopList, listTopLists } from "../contract/routes";
import type { AppEnv } from "../http/env";
import { guarded } from "./guard";
import { AppError, ErrorCode } from "../services/errors";
import { topListDetail, topListStandings } from "../services/top-lists";

/** Published lists with the member's and their friends' progress (issue #17). */
export function registerTopListRoutes(app: OpenAPIHono<AppEnv>, deps: AppDependencies): void {
  app.openapi(guarded(listTopLists), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    return c.json({ lists: (await topListStandings(deps.db, user.id)).map(toTopListProgress) }, 200);
  });

  app.openapi(guarded(getTopList), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { type, scope } = c.req.valid("param");
    const detail = await topListDetail(deps.db, user.id, type, scope);
    if (!detail) throw new AppError(404, ErrorCode.TopListNotFound, "There is no published list by that name.");
    return c.json(toTopListDetail(detail), 200);
  });
}
