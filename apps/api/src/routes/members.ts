import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppDependencies } from "../app";
import { requireUser } from "../auth/middleware";
import { toMemberList } from "../contract/mappers";
import {
  befriendMember,
  getMemberList,
  listFriendRequests,
  listMembers,
  removeFriend,
  searchMembers,
} from "../contract/routes";
import type { AppEnv } from "../http/env";
import { guarded } from "./guard";
import { AppError, ErrorCode } from "../services/errors";
import * as friends from "../services/friends";

const DEFAULT_PAGE_SIZE = 50;

/**
 * Friends, their lists, member search and friend requests. Every operation
 * acts for the token's member; a member sees only their own and their
 * accepted friends' lists (decision 2026-09-29, friends-only visibility).
 */
export function registerMemberRoutes(app: OpenAPIHono<AppEnv>, deps: AppDependencies): void {
  app.openapi(guarded(listMembers), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { cursor, limit } = c.req.valid("query");
    const page = await friends.memberPage(deps.db, user.id, {
      after: cursor ?? null,
      limit: limit ?? DEFAULT_PAGE_SIZE,
    });
    return c.json(page, 200);
  });

  app.openapi(guarded(getMemberList), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { username } = c.req.valid("param");
    const list = await friends.memberList(deps.db, user.id, username);
    if (!list) throw new AppError(404, ErrorCode.MemberNotFound, "No member with that username among your friends.");
    return c.json(toMemberList(list), 200);
  });

  app.openapi(guarded(searchMembers), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { q } = c.req.valid("query");
    return c.json({ results: await friends.searchMembers(deps.db, user.id, q) }, 200);
  });

  app.openapi(guarded(listFriendRequests), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    return c.json(await friends.friendRequests(deps.db, user.id), 200);
  });

  app.openapi(guarded(befriendMember), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { username } = c.req.valid("param");
    return c.json(await friends.befriendMember(deps.db, user.id, username), 200);
  });

  app.openapi(guarded(removeFriend), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { username } = c.req.valid("param");
    await friends.removeFriend(deps.db, user.id, username);
    return c.body(null, 204);
  });
}
