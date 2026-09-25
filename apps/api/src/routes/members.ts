import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppDependencies } from "../app";
import { requireUser } from "../auth/middleware";
import { toMemberList } from "../contract/mappers";
import { getMemberList, listMembers } from "../contract/routes";
import type { AppEnv } from "../http/env";
import { AppError, ErrorCode } from "../services/errors";
import { memberList, memberPage } from "../services/friends";

const DEFAULT_PAGE_SIZE = 50;

/** The member directory and other members' lists. */
export function registerMemberRoutes(app: OpenAPIHono<AppEnv>, deps: AppDependencies): void {
  app.openapi(listMembers, async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { cursor, limit } = c.req.valid("query");
    const page = await memberPage(deps.db, user.id, {
      after: cursor ?? null,
      limit: limit ?? DEFAULT_PAGE_SIZE,
    });
    return c.json(page, 200);
  });

  app.openapi(getMemberList, async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { username } = c.req.valid("param");
    const list = await memberList(deps.db, user.id, username);
    if (!list) throw new AppError(404, ErrorCode.MemberNotFound, "No member with that username.");
    return c.json(toMemberList(list), 200);
  });
}
